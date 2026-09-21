import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { sendSuccess, sendPaginated, handleRouteError } from "../shared/response";
import { validateQuery, paginationQuerySchema, dateOrRangeShape, withDateOrRangeRefinement, resolveDateRange } from "../shared/validation";
import { authenticateRequest, requireApiRole } from "../shared/authenticate";

// Reporting endpoints for third-party BI/analytics tools (Power BI, etc).
// These mirror the legacy /api/reporting/* routes one-for-one, restricted to
// super_admin, but on the standardized v1 envelope with pagination where the
// underlying storage method already supports it.
export const reportsV1Router = Router();

reportsV1Router.use(authenticateRequest, requireApiRole("super_admin"));

const listQuerySchema = withDateOrRangeRefinement(z.object({
  ...paginationQuerySchema.shape,
  ...dateOrRangeShape,
}));

reportsV1Router.get("/members", validateQuery(paginationQuerySchema), async (req, res) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof paginationQuerySchema>;
    const result = await storage.getMembers(req.scope!, { page: q.page, limit: q.limit });
    return sendPaginated(res, result.data, { page: result.page, limit: result.limit, total: result.total });
  } catch (error) {
    return handleRouteError(res, error, "Failed to fetch members report.");
  }
});

reportsV1Router.get("/first-timers", validateQuery(listQuerySchema), async (req, res) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof listQuerySchema>;
    const { from, to } = resolveDateRange(q);
    const result = await storage.getFirstTimers(req.scope!, { page: q.page, limit: q.limit, dateFrom: from, dateTo: to });
    return sendPaginated(res, result.data, { page: result.page, limit: result.limit, total: result.total });
  } catch (error) {
    return handleRouteError(res, error, "Failed to fetch first-timers report.");
  }
});

reportsV1Router.get("/attendance", validateQuery(listQuerySchema), async (req, res) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof listQuerySchema>;
    const { from, to } = resolveDateRange(q);
    const result = await storage.getAttendanceList(req.scope!, { page: q.page, limit: q.limit, dateFrom: from, dateTo: to });
    return sendPaginated(res, result.data, { page: result.page, limit: result.limit, total: result.total });
  } catch (error) {
    return handleRouteError(res, error, "Failed to fetch attendance report.");
  }
});

reportsV1Router.get("/follow-up-tasks", validateQuery(paginationQuerySchema), async (req, res) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof paginationQuerySchema>;
    const result = await storage.getFollowUpTasks(req.scope!, { page: q.page, limit: q.limit });
    return sendPaginated(res, result.data, { page: result.page, limit: result.limit, total: result.total });
  } catch (error) {
    return handleRouteError(res, error, "Failed to fetch follow-up tasks report.");
  }
});

// The remaining reporting resources (cells, branches, users, clusters) are
// small, low-cardinality tables in this domain (a handful of church branches
// and their cell groups) — the legacy routes return them unpaginated, and v1
// keeps that behavior, just on the standardized envelope.
reportsV1Router.get("/cells", async (req, res) => {
  try {
    const cells = await storage.getCells(req.scope!);
    return sendSuccess(res, cells, { count: cells.length });
  } catch (error) {
    return handleRouteError(res, error, "Failed to fetch cells report.");
  }
});

reportsV1Router.get("/branches", async (_req, res) => {
  try {
    const branchList = await storage.getBranches();
    return sendSuccess(res, branchList, { count: branchList.length });
  } catch (error) {
    return handleRouteError(res, error, "Failed to fetch branches report.");
  }
});

reportsV1Router.get("/clusters", async (req, res) => {
  try {
    const clusterList = await storage.getClusters(req.scope!);
    return sendSuccess(res, clusterList, { count: clusterList.length });
  } catch (error) {
    return handleRouteError(res, error, "Failed to fetch clusters report.");
  }
});

reportsV1Router.get("/users", async (_req, res) => {
  try {
    const users = await storage.getUsers();
    const safeUsers = users.map(({ passwordHash: _passwordHash, passwordResetToken: _passwordResetToken, ...safe }) => safe);
    return sendSuccess(res, safeUsers, { count: safeUsers.length });
  } catch (error) {
    return handleRouteError(res, error, "Failed to fetch users report.");
  }
});
