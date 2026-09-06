import type { Permission } from "./permissions";
import { ROLE_PERMISSIONS, type RoleKey } from "./roles";

/** The one place a role/permission decision is made. Every tRPC procedure calls this (via requirePermission below) instead of branching on role identity directly. */
export function can(roleKey: RoleKey, permission: Permission): boolean {
  return ROLE_PERMISSIONS[roleKey]?.includes(permission) ?? false;
}

export class ForbiddenError extends Error {
  constructor(
    readonly permission: Permission,
    readonly roleKey: RoleKey,
  ) {
    super(`Role "${roleKey}" lacks permission "${permission}"`);
    this.name = "ForbiddenError";
  }
}

/** Throws ForbiddenError if the role lacks the permission. The tRPC middleware wraps this — see apps/web/server/trpc.ts. */
export function assertPermission(roleKey: RoleKey, permission: Permission): void {
  if (!can(roleKey, permission)) {
    throw new ForbiddenError(permission, roleKey);
  }
}
