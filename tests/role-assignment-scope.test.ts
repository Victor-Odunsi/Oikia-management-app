/**
 * Least-privilege guard on role assignment: every role except super_admin
 * must be scoped to where it actually operates (branch, and for group_admin/
 * cell_leader, cluster/cell too) — an admin should never be able to submit
 * an unscoped (and therefore over- or under-privileged) role assignment.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { roleAssignmentSchema, updateUserRoleSchema } from "../shared/schema.ts";

const baseUserId = "00000000-0000-0000-0000-000000000001";
const branchId = "00000000-0000-0000-0000-000000000010";
const clusterId = "00000000-0000-0000-0000-000000000020";
const cellId = "00000000-0000-0000-0000-000000000030";

// ── roleAssignmentSchema (create path) ──────────────────────────────────────

test("roleAssignmentSchema accepts super_admin with no scope at all", () => {
  const result = roleAssignmentSchema.safeParse({ userId: baseUserId, role: "super_admin" });
  assert.equal(result.success, true);
});

test("roleAssignmentSchema rejects branch_admin without a branch", () => {
  const result = roleAssignmentSchema.safeParse({ userId: baseUserId, role: "branch_admin" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((i) => i.path.includes("branchId")));
  }
});

test("roleAssignmentSchema accepts branch_admin with a branch", () => {
  const result = roleAssignmentSchema.safeParse({ userId: baseUserId, role: "branch_admin", branchId });
  assert.equal(result.success, true);
});

test("roleAssignmentSchema rejects branch_rep without a branch", () => {
  const result = roleAssignmentSchema.safeParse({ userId: baseUserId, role: "branch_rep" });
  assert.equal(result.success, false);
});

test("roleAssignmentSchema rejects group_admin with a branch but no cluster", () => {
  const result = roleAssignmentSchema.safeParse({ userId: baseUserId, role: "group_admin", branchId });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((i) => i.path.includes("clusterId")));
  }
});

test("roleAssignmentSchema accepts group_admin with branch and cluster", () => {
  const result = roleAssignmentSchema.safeParse({ userId: baseUserId, role: "group_admin", branchId, clusterId });
  assert.equal(result.success, true);
});

test("roleAssignmentSchema rejects cell_leader with branch and cluster but no cell", () => {
  const result = roleAssignmentSchema.safeParse({ userId: baseUserId, role: "cell_leader", branchId, clusterId });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((i) => i.path.includes("cellId")));
  }
});

test("roleAssignmentSchema accepts a fully-scoped cell_leader", () => {
  const result = roleAssignmentSchema.safeParse({ userId: baseUserId, role: "cell_leader", branchId, clusterId, cellId });
  assert.equal(result.success, true);
});

test("roleAssignmentSchema rejects an empty-string branchId the same as missing", () => {
  const result = roleAssignmentSchema.safeParse({ userId: baseUserId, role: "branch_admin", branchId: "" });
  assert.equal(result.success, false);
});

// ── updateUserRoleSchema (edit path) ─────────────────────────────────────────

test("updateUserRoleSchema re-validates scope when role is included in the update", () => {
  const result = updateUserRoleSchema.safeParse({ role: "cell_leader", branchId, clusterId });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((i) => i.path.includes("cellId")));
  }
});

test("updateUserRoleSchema accepts a fully-scoped update", () => {
  const result = updateUserRoleSchema.safeParse({ role: "group_admin", branchId, clusterId });
  assert.equal(result.success, true);
});

test("updateUserRoleSchema allows a partial update that doesn't touch role", () => {
  const result = updateUserRoleSchema.safeParse({ branchId });
  assert.equal(result.success, true);
});
