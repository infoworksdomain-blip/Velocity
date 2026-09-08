/**
 * The permission catalog — one central list, per STEP 3's "one central
 * policy module, no if (role === 'admin') scattered around" rule. Every
 * tRPC procedure that needs authorization declares one of these via
 * requirePermission() (packages/core/src/rbac/policy.ts).
 *
 * Shape: `${resource}:${action}:${scope}`. `scope` always matches
 * roles.scope from the STEP 2 schema — "workspace" permissions are
 * evaluated against a workspace membership's role, "platform" permissions
 * against a platform-level role.
 */

export const PERMISSION_CATALOG = [
  // Workspace
  "workspace:read:workspace",
  "workspace:update:workspace",
  "workspace:archive:workspace",
  "workspace:transfer_ownership:workspace",
  "members:invite:workspace",
  "members:remove:workspace",
  "members:role_change:workspace",
  // Brand
  "brand_profile:read:workspace",
  "brand_profile:update:workspace",
  // Content
  "content:create:workspace",
  "content:read:workspace",
  "content:update:workspace",
  "content:delete:workspace",
  "content:approve:workspace",
  "content:publish:workspace",
  // Calendar / scheduling
  "calendar:manage:workspace",
  // Social accounts
  "social_account:connect:workspace",
  "social_account:disconnect:workspace",
  // Analytics
  "analytics:read:workspace",
  // Automation
  "automation:manage:workspace",
  // Billing (workspace-level visibility/management)
  "billing:read:workspace",
  "billing:manage:workspace",
  // Agency / client portal
  "agency:manage_clients:workspace",
  "client_portal:approve:workspace",

  // Platform
  "users:impersonate:platform",
  "users:suspend:platform",
  "workspaces:manage_any:platform",
  "moderation:review:platform",
  "billing:manage_any:platform",
  "feature_flags:manage:platform",
  "system:configure:platform",
  // STEP 18: the build script's own "audit log viewer" — no pre-existing
  // permission covered this (the others are all about taking an action;
  // this is read-only oversight), so it's a genuine new grant, not a
  // reuse of an existing one.
  "audit_log:read:platform",
] as const;

export type Permission = (typeof PERMISSION_CATALOG)[number];

export type PermissionScope = "workspace" | "platform";

export function scopeOf(permission: Permission): PermissionScope {
  return permission.endsWith(":platform") ? "platform" : "workspace";
}
