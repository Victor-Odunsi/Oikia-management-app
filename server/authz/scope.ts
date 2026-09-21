import { storage } from "../storage";

/**
 * What a request is allowed to see/touch. super_admin is unrestricted;
 * every other role is confined to a branch, and group_admin/cell_leader
 * are further confined to a cluster/cell within that branch.
 */
export type Scope =
  | { role: "super_admin" }
  | {
      role: "branch_admin" | "group_admin" | "cell_leader" | "branch_rep";
      branchId: string;
      clusterId: string | null;
      cellId: string | null;
    };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      scope?: Scope;
    }
  }
}

// A visible, greppable escape hatch for genuinely public/unauthenticated
// routes (e.g. the visitor-facing first-timer intake form). Never use this
// for an authenticated request — it grants unrestricted access.
export const UNRESTRICTED_SCOPE: Scope = { role: "super_admin" };

/**
 * Resolves an authenticated user's role into the scope their queries must be
 * filtered by. Returns undefined if the user has no role at all, or has a
 * non-super_admin role with no branch assigned — both fail closed (no scope
 * resolved => no access), rather than defaulting to unrestricted.
 */
export async function resolveUserScope(userId: string): Promise<Scope | undefined> {
  const role = await storage.getUserRole(userId);
  if (!role) return undefined;
  if (role.role === "super_admin") return { role: "super_admin" };
  if (!role.branchId) return undefined;
  return {
    role: role.role as "branch_admin" | "group_admin" | "cell_leader" | "branch_rep",
    branchId: role.branchId,
    clusterId: role.clusterId,
    cellId: role.cellId,
  };
}
