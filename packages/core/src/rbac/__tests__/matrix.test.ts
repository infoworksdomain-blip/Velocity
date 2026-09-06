import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG, scopeOf } from "../permissions";
import { can } from "../policy";
import { ALL_ROLE_KEYS, PLATFORM_ROLE_KEYS, ROLE_PERMISSIONS, WORKSPACE_ROLE_KEYS } from "../roles";

/**
 * GATE 3's "permission matrix test covering every role x every permission."
 * This is a completeness/consistency check over the ROLE_PERMISSIONS data,
 * not a hand-maintained table of expected results — the data in roles.ts
 * IS the policy, so this test verifies the data is well-formed rather than
 * re-deriving the same answers a second time.
 */
describe("RBAC permission matrix", () => {
  it("every role x permission combination resolves to a boolean without throwing", () => {
    for (const role of ALL_ROLE_KEYS) {
      for (const permission of PERMISSION_CATALOG) {
        expect(typeof can(role, permission)).toBe("boolean");
      }
    }
  });

  it("no workspace role holds a platform-scoped permission", () => {
    for (const role of WORKSPACE_ROLE_KEYS) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(scopeOf(permission), `${role} should not hold platform permission ${permission}`).toBe(
          "workspace",
        );
      }
    }
  });

  it("no platform role holds a workspace-scoped permission", () => {
    for (const role of PLATFORM_ROLE_KEYS) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(scopeOf(permission), `${role} should not hold workspace permission ${permission}`).toBe(
          "platform",
        );
      }
    }
  });

  it("every permission in the catalog is granted to at least one role", () => {
    const granted = new Set(ALL_ROLE_KEYS.flatMap((role) => ROLE_PERMISSIONS[role]));
    for (const permission of PERMISSION_CATALOG) {
      expect(granted.has(permission), `no role grants ${permission} — dead permission?`).toBe(true);
    }
  });

  it("every role has at least one permission", () => {
    for (const role of ALL_ROLE_KEYS) {
      expect(ROLE_PERMISSIONS[role].length, `${role} has zero permissions`).toBeGreaterThan(0);
    }
  });

  it("owner can publish content; viewer and client cannot", () => {
    expect(can("owner", "content:publish:workspace")).toBe(true);
    expect(can("viewer", "content:publish:workspace")).toBe(false);
    expect(can("client", "content:publish:workspace")).toBe(false);
  });

  it("only owner manages workspace-level billing", () => {
    expect(can("owner", "billing:manage:workspace")).toBe(true);
    expect(can("admin", "billing:manage:workspace")).toBe(false);
    expect(can("editor", "billing:manage:workspace")).toBe(false);
  });

  it("support can impersonate but cannot manage billing platform-wide", () => {
    expect(can("support", "users:impersonate:platform")).toBe(true);
    expect(can("support", "billing:manage_any:platform")).toBe(false);
  });

  it("finance manages platform billing but cannot impersonate users", () => {
    expect(can("finance", "billing:manage_any:platform")).toBe(true);
    expect(can("finance", "users:impersonate:platform")).toBe(false);
  });

  it("an unknown role has no permissions rather than throwing", () => {
    // @ts-expect-error deliberately passing an invalid role to prove fail-closed behavior
    expect(can("not_a_real_role", "content:read:workspace")).toBe(false);
  });
});
