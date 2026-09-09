/**
 * Transactional email (verification, password reset). This audit-
 * remediation pass gave it its first real adapter: Resend, chosen because
 * the codebase already documented `RESEND_API_KEY` in CLAUDE.md's env-var
 * list (STEP 22) without ever wiring it to anything. The local-dev adapter
 * stays as the default when no key is configured, so nothing throws at
 * startup in dev/CI.
 */

import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  id: string;
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export class LocalDevEmailProvider implements EmailProvider {
  readonly id = "local-dev";

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const messageId = `local-dev-${Date.now()}`;
    console.log(`[email:local-dev] to=${message.to} subject="${message.subject}" id=${messageId}\n${message.text}`);
    return { messageId };
  }
}

/**
 * Real Resend SDK usage, tested against a local mock HTTP server via the
 * SDK's own documented `baseUrl` constructor option — the same "real SDK,
 * no live network" discipline already used for Stripe/Anthropic/OpenAI
 * elsewhere in this codebase.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly id = "resend";
  private readonly client: Resend;
  private readonly fromAddress: string;

  constructor(apiKey: string, fromAddress: string, options?: { baseUrl?: string }) {
    this.client = new Resend(apiKey, options?.baseUrl ? { baseUrl: options.baseUrl } : undefined);
    this.fromAddress = fromAddress;
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const { data, error } = await this.client.emails.send({
      from: this.fromAddress,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? message.text,
    });
    if (error || !data) {
      throw new Error(`ResendEmailProvider: send failed — ${error?.name ?? "unknown_error"}: ${error?.message ?? "no data returned"}`);
    }
    return { messageId: data.id };
  }
}

/**
 * Resend if RESEND_API_KEY is configured, else the local-dev console
 * logger — mirrors packages/db/src/kms.ts's createKmsProvider() DI shape,
 * except this one falls back instead of throwing: email delivery is a
 * real but non-critical-path concern (nothing in this codebase's own
 * "throws at startup" list requires it), unlike encryption.
 */
export function createEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return new LocalDevEmailProvider();
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "noreply@velocity.app";
  return new ResendEmailProvider(apiKey, fromAddress, process.env.RESEND_BASE_URL ? { baseUrl: process.env.RESEND_BASE_URL } : undefined);
}
