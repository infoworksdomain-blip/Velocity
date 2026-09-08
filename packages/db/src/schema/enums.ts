import { pgEnum } from "drizzle-orm/pg-core";

export const workspaceTypeEnum = pgEnum("workspace_type", ["individual", "business"]);

export const platformEnum = pgEnum("platform", ["tiktok", "instagram", "youtube"]);

export const contentFormatEnum = pgEnum("content_format", [
  "ai_ugc",
  "slideshow",
  "hook_demo",
  "meme",
]);

export const contentItemStatusEnum = pgEnum("content_item_status", [
  "concept",
  "queued",
  "rendering",
  "ready",
  "scheduled",
  "published",
  "rejected",
  "failed",
]);

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "editor",
  "contributor",
  "viewer",
  "client",
  "agency_manager",
]);

export const platformRoleEnum = pgEnum("platform_role", [
  "superadmin",
  "support",
  "moderator",
  "finance",
]);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const publicationStatusEnum = pgEnum("publication_status", [
  "pending",
  "publishing",
  "published",
  "failed",
]);

/** roles.scope — a null-workspace platform role vs. a workspace-scoped role. */
export const roleScopeEnum = pgEnum("role_scope", ["workspace", "platform"]);

export const swipeDirectionEnum = pgEnum("swipe_direction", ["left", "right"]);

export const renderStatusEnum = pgEnum("render_status", [
  "pending",
  "running",
  "qc_failed",
  "succeeded",
  "failed",
  "cancelled",
]);

export const renderStepStateEnum = pgEnum("render_step_state", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);

/**
 * social_accounts.connection_status (STEP 11). `connected` — the token is
 * valid and no reauth is needed. `reauth_required` — the token was
 * revoked/expired and the account needs the user to reconnect (GATE 11:
 * "a revoked token yields a clear reconnect prompt, not a silent
 * failure" — this is the field that prompt reads). `disconnected` — the
 * user explicitly disconnected the account.
 */
export const connectionStatusEnum = pgEnum("connection_status", ["connected", "reauth_required", "disconnected"]);

/**
 * Creator Marketplace engagement lifecycle (STEP 17, build script module
 * 29: "brief -> delivery -> approval -> payment"). `rejected` is not
 * terminal — a workspace can reject a delivery and the creator re-
 * delivers (real creative feedback loops), so `rejected -> delivered` is
 * a valid transition (see packages/core/src/agency/engagement-lifecycle.ts).
 * `cancelled` is terminal and only reachable from `briefed`/`accepted`
 * (before real creative work or payment has happened).
 */
export const marketplaceEngagementStatusEnum = pgEnum("marketplace_engagement_status", ["briefed", "accepted", "delivered", "approved", "rejected", "paid", "cancelled"]);

