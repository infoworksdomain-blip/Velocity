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

