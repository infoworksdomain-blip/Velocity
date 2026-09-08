import type { Permission } from "./permissions";

/** Matches roles.key values seeded in packages/db/seed/seed.ts and the script's STEP 3 role list. */
export const WORKSPACE_ROLE_KEYS = [
  "owner",
  "admin",
  "editor",
  "contributor",
  "viewer",
  "client",
  "agency_manager",
] as const;

export const PLATFORM_ROLE_KEYS = ["superadmin", "support", "moderator", "finance"] as const;

export type WorkspaceRoleKey = (typeof WORKSPACE_ROLE_KEYS)[number];
export type PlatformRoleKey = (typeof PLATFORM_ROLE_KEYS)[number];
export type RoleKey = WorkspaceRoleKey | PlatformRoleKey;

export const ALL_ROLE_KEYS: readonly RoleKey[] = [...WORKSPACE_ROLE_KEYS, ...PLATFORM_ROLE_KEYS];

/**
 * The role -> permission map. This is the actual policy data — GATE 3's
 * "permission matrix" test is a completeness/consistency check over this
 * object, not a hand-written list of allow/deny pairs maintained twice.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  owner: [
    "workspace:read:workspace",
    "workspace:update:workspace",
    "workspace:archive:workspace",
    "workspace:transfer_ownership:workspace",
    "members:invite:workspace",
    "members:remove:workspace",
    "members:role_change:workspace",
    "brand_profile:read:workspace",
    "brand_profile:update:workspace",
    "content:create:workspace",
    "content:read:workspace",
    "content:update:workspace",
    "content:delete:workspace",
    "content:approve:workspace",
    "content:publish:workspace",
    "calendar:manage:workspace",
    "social_account:connect:workspace",
    "social_account:disconnect:workspace",
    "analytics:read:workspace",
    "automation:manage:workspace",
    "billing:read:workspace",
    "billing:manage:workspace",
  ],
  admin: [
    "workspace:read:workspace",
    "workspace:update:workspace",
    "members:invite:workspace",
    "members:remove:workspace",
    "members:role_change:workspace",
    "brand_profile:read:workspace",
    "brand_profile:update:workspace",
    "content:create:workspace",
    "content:read:workspace",
    "content:update:workspace",
    "content:delete:workspace",
    "content:approve:workspace",
    "content:publish:workspace",
    "calendar:manage:workspace",
    "social_account:connect:workspace",
    "social_account:disconnect:workspace",
    "analytics:read:workspace",
    "automation:manage:workspace",
    "billing:read:workspace",
  ],
  editor: [
    "workspace:read:workspace",
    "brand_profile:read:workspace",
    "content:create:workspace",
    "content:read:workspace",
    "content:update:workspace",
    "content:publish:workspace",
    "calendar:manage:workspace",
    "analytics:read:workspace",
  ],
  contributor: [
    "workspace:read:workspace",
    "brand_profile:read:workspace",
    "content:create:workspace",
    "content:read:workspace",
    "content:update:workspace",
    "analytics:read:workspace",
  ],
  viewer: [
    "workspace:read:workspace",
    "brand_profile:read:workspace",
    "content:read:workspace",
    "analytics:read:workspace",
  ],
  client: ["content:read:workspace", "client_portal:approve:workspace", "analytics:read:workspace"],
  agency_manager: [
    "workspace:read:workspace",
    "workspace:update:workspace",
    "members:invite:workspace",
    "brand_profile:read:workspace",
    "brand_profile:update:workspace",
    "content:create:workspace",
    "content:read:workspace",
    "content:update:workspace",
    "content:approve:workspace",
    "content:publish:workspace",
    "calendar:manage:workspace",
    "analytics:read:workspace",
    "automation:manage:workspace",
    "billing:read:workspace",
    "agency:manage_clients:workspace",
  ],

  superadmin: [
    "users:impersonate:platform",
    "users:suspend:platform",
    "workspaces:manage_any:platform",
    "moderation:review:platform",
    "billing:manage_any:platform",
    "feature_flags:manage:platform",
    "system:configure:platform",
    "audit_log:read:platform",
    "gdpr:manage:platform",
  ],
  support: ["users:impersonate:platform", "workspaces:manage_any:platform", "audit_log:read:platform"],
  moderator: ["moderation:review:platform"],
  finance: ["billing:manage_any:platform"],
};
