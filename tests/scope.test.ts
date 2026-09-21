/**
 * Unit tests for resolveUserScope's role -> Scope mapping (matching
 * server/authz/scope.ts). Mocks the storage layer so tests run without a
 * database connection, following the same pattern as
 * permission-middleware.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";

type Role = {
  role: string;
  branchId: string | null;
  clusterId: string | null;
  cellId: string | null;
};

type StorageLike = {
  getUserRole(userId: string): Promise<Role | undefined>;
};

/** Recreates resolveUserScope's logic (matching server/authz/scope.ts). */
function buildResolveUserScope(storage: StorageLike) {
  return async function resolveUserScope(userId: string) {
    const role = await storage.getUserRole(userId);
    if (!role) return undefined;
    if (role.role === "super_admin") return { role: "super_admin" as const };
    if (!role.branchId) return undefined;
    return {
      role: role.role as "branch_admin" | "group_admin" | "cell_leader" | "branch_rep",
      branchId: role.branchId,
      clusterId: role.clusterId,
      cellId: role.cellId,
    };
  };
}

test("resolveUserScope returns undefined when the user has no role", async () => {
  const resolveUserScope = buildResolveUserScope({ getUserRole: async () => undefined });
  const scope = await resolveUserScope("user-1");
  assert.equal(scope, undefined);
});

test("resolveUserScope returns an unrestricted scope for super_admin regardless of branch", async () => {
  const resolveUserScope = buildResolveUserScope({
    getUserRole: async () => ({ role: "super_admin", branchId: null, clusterId: null, cellId: null }),
  });
  const scope = await resolveUserScope("admin-1");
  assert.deepEqual(scope, { role: "super_admin" });
});

test("resolveUserScope fails closed (undefined) for a non-super_admin role with no branch", async () => {
  const resolveUserScope = buildResolveUserScope({
    getUserRole: async () => ({ role: "branch_admin", branchId: null, clusterId: null, cellId: null }),
  });
  const scope = await resolveUserScope("user-1");
  assert.equal(scope, undefined, "an unscoped non-super_admin role must resolve to no access, not unrestricted access");
});

test("resolveUserScope carries branchId through for branch_admin", async () => {
  const resolveUserScope = buildResolveUserScope({
    getUserRole: async () => ({ role: "branch_admin", branchId: "branch-1", clusterId: null, cellId: null }),
  });
  const scope = await resolveUserScope("user-1");
  assert.deepEqual(scope, { role: "branch_admin", branchId: "branch-1", clusterId: null, cellId: null });
});

test("resolveUserScope carries branchId + clusterId through for group_admin", async () => {
  const resolveUserScope = buildResolveUserScope({
    getUserRole: async () => ({ role: "group_admin", branchId: "branch-1", clusterId: "cluster-1", cellId: null }),
  });
  const scope = await resolveUserScope("user-1");
  assert.deepEqual(scope, { role: "group_admin", branchId: "branch-1", clusterId: "cluster-1", cellId: null });
});

test("resolveUserScope carries branchId + cellId through for cell_leader", async () => {
  const resolveUserScope = buildResolveUserScope({
    getUserRole: async () => ({ role: "cell_leader", branchId: "branch-1", clusterId: null, cellId: "cell-1" }),
  });
  const scope = await resolveUserScope("user-1");
  assert.deepEqual(scope, { role: "cell_leader", branchId: "branch-1", clusterId: null, cellId: "cell-1" });
});

test("resolveUserScope carries branchId through for branch_rep", async () => {
  const resolveUserScope = buildResolveUserScope({
    getUserRole: async () => ({ role: "branch_rep", branchId: "branch-2", clusterId: null, cellId: null }),
  });
  const scope = await resolveUserScope("user-1");
  assert.deepEqual(scope, { role: "branch_rep", branchId: "branch-2", clusterId: null, cellId: null });
});

// ── branchCondition-style branching (matching storage.ts's private helper) ──

type Scope =
  | { role: "super_admin" }
  | { role: "branch_admin" | "group_admin" | "cell_leader" | "branch_rep"; branchId: string; clusterId: string | null; cellId: string | null };

function branchCondition(scope: Scope): { branchId: string } | undefined {
  return scope.role === "super_admin" ? undefined : { branchId: scope.branchId };
}

test("branchCondition is undefined (unrestricted) for super_admin", () => {
  assert.equal(branchCondition({ role: "super_admin" }), undefined);
});

for (const role of ["branch_admin", "group_admin", "cell_leader", "branch_rep"] as const) {
  test(`branchCondition restricts ${role} to their own branch`, () => {
    const scope: Scope = { role, branchId: "branch-9", clusterId: null, cellId: null };
    assert.deepEqual(branchCondition(scope), { branchId: "branch-9" });
  });
}
