import { randomUUID } from "node:crypto";
import { auth } from "@velocity/core";
import { createKmsProvider, schema } from "@velocity/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { checkAndRecordSignupRisk } from "../admin-service";
import { getAdminDb } from "../db";
import { createSession } from "../session-service";
import { protectedProcedure, publicProcedure, requirePlatformPermission, router } from "../trpc";

/**
 * STEP 3's auth router. Proves the pattern (session issuance, MFA,
 * permission-gated procedures, audit-logged impersonation) — it is not a
 * complete account-management API. No workspace/membership creation here;
 * that's STEP 4/5's onboarding flow. No pages call this yet (STEP 5/7).
 */
export const authRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.user),

  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await getAdminDb()
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, input.email))
        .limit(1);
      if (existing[0]) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
      }

      const passwordHash = await auth.hashPassword(input.password);
      const userId = randomUUID();
      await getAdminDb().insert(schema.users).values({
        id: userId,
        email: input.email,
        name: input.name,
        passwordHash,
      });

      // STEP 18: real, non-blocking disposable-email detection — see
      // admin-service.ts's checkAndRecordSignupRisk for why this doesn't
      // write to risk_signals (workspace-scoped, no workspace exists yet).
      await checkAndRecordSignupRisk(userId, input.email);

      const session = await createSession(userId);
      return { userId, ...session };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ input }) => {
      const rows = await getAdminDb()
        .select({ id: schema.users.id, passwordHash: schema.users.passwordHash, suspendedAt: schema.users.suspendedAt })
        .from(schema.users)
        .where(eq(schema.users.email, input.email))
        .limit(1);
      const user = rows[0];

      // Constant-shape failure: run a hash comparison against a fixed
      // dummy value even when the user doesn't exist, so a login attempt
      // against an unknown email doesn't return measurably faster than one
      // against a known email with a wrong password (timing side-channel).
      const passwordHash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
      const passwordValid = await auth.verifyPassword(input.password, passwordHash);

      if (!user || !passwordValid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      // STEP 18: a suspended user's password may be correct, but no session is issued — the real enforcement half of admin user suspension, checked AFTER the password to avoid leaking "this account exists and is suspended" to an unauthenticated caller who doesn't know the password.
      if (user.suspendedAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This account has been suspended" });
      }

      const session = await createSession(user.id);
      return { userId: user.id, ...session };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await getAdminDb()
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.id, ctx.sessionId));
    return { ok: true };
  }),

  sessions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getAdminDb()
        .select({
          id: schema.sessions.id,
          userAgent: schema.sessions.userAgent,
          ipAddress: schema.sessions.ipAddress,
          createdAt: schema.sessions.createdAt,
          lastUsedAt: schema.sessions.lastUsedAt,
          expiresAt: schema.sessions.expiresAt,
        })
        .from(schema.sessions)
        .where(and(eq(schema.sessions.userId, ctx.user.id), isNull(schema.sessions.revokedAt)))
        .orderBy(desc(schema.sessions.lastUsedAt));
    }),

    revoke: protectedProcedure
      .input(z.object({ sessionId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        // Scoped to the caller's own userId, so one user can never revoke
        // another user's session through this procedure.
        await getAdminDb()
          .update(schema.sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(schema.sessions.id, input.sessionId), eq(schema.sessions.userId, ctx.user.id)));
        return { ok: true };
      }),
  }),

  mfa: router({
    /** Returns the otpauth URL (render as a QR code client-side) and plaintext recovery codes — shown to the user exactly once. */
    enroll: protectedProcedure.mutation(async ({ ctx }) => {
      const enrollment = auth.enrollMfa(ctx.user.email);
      const kms = createKmsProvider();
      const encrypted = await kms.encrypt(enrollment.secretBase32);

      await getAdminDb().insert(schema.mfaCredentials).values({
        id: randomUUID(),
        userId: ctx.user.id,
        secretEncrypted: encrypted.ciphertext,
        kmsKeyId: encrypted.keyId,
      });

      await getAdminDb().insert(schema.mfaRecoveryCodes).values(
        enrollment.recoveryCodes.map((code) => ({
          id: randomUUID(),
          userId: ctx.user.id,
          codeHash: auth.hashRecoveryCode(code),
        })),
      );

      return { otpAuthUrl: enrollment.otpAuthUrl, recoveryCodes: enrollment.recoveryCodes };
    }),

    /** Confirms enrollment with a live TOTP code, marking the credential enabled. */
    verify: protectedProcedure.input(z.object({ token: z.string() })).mutation(async ({ ctx, input }) => {
      const rows = await getAdminDb()
        .select({ id: schema.mfaCredentials.id, secretEncrypted: schema.mfaCredentials.secretEncrypted, kmsKeyId: schema.mfaCredentials.kmsKeyId })
        .from(schema.mfaCredentials)
        .where(and(eq(schema.mfaCredentials.userId, ctx.user.id), isNull(schema.mfaCredentials.enabledAt)))
        .limit(1);
      const credential = rows[0];
      if (!credential) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No pending MFA enrollment" });
      }

      const kms = createKmsProvider();
      const secretBase32 = await kms.decrypt(credential.secretEncrypted, credential.kmsKeyId);
      if (!auth.verifyTotpToken(secretBase32, input.token)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid MFA token" });
      }

      await getAdminDb()
        .update(schema.mfaCredentials)
        .set({ enabledAt: new Date() })
        .where(eq(schema.mfaCredentials.id, credential.id));
      return { ok: true };
    }),
  }),

  admin: router({
    /**
     * Time-boxed support impersonation. Gated on the platform permission
     * (not a role-name check), and writes both a lifecycle row
     * (impersonation_sessions) and the permanent audit_logs record GATE 3
     * checks for, in a way a caller can't skip by only calling half of it.
     */
    impersonate: requirePlatformPermission("users:impersonate:platform")
      .input(z.object({ targetUserId: z.string().uuid(), reason: z.string().min(3) }))
      .mutation(async ({ ctx, input }) => {
        const impersonationId = randomUUID();
        await getAdminDb().insert(schema.impersonationSessions).values({
          id: impersonationId,
          actorUserId: ctx.user.id,
          targetUserId: input.targetUserId,
          reason: input.reason,
        });
        await getAdminDb().insert(schema.auditLogs).values({
          id: randomUUID(),
          actorUserId: ctx.user.id,
          action: "impersonate",
          targetType: "user",
          targetId: input.targetUserId,
          before: null,
          after: { reason: input.reason, impersonationId },
        });

        const session = await createSession(input.targetUserId);
        return { impersonationId, ...session };
      }),
  }),
});
