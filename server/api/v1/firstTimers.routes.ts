import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { insertFirstTimerSchema } from "@shared/schema";
import { sendSuccess, sendPaginated, sendError, handleRouteError } from "../shared/response";
import { validateQuery, validateBody, validateParams, paginationQuerySchema, sortQuerySchema, idParamSchema, dateOrRangeShape, withDateOrRangeRefinement, resolveDateRange } from "../shared/validation";
import { authenticateRequest, requireApiPermission } from "../shared/authenticate";

export const firstTimersV1Router = Router();

firstTimersV1Router.use(authenticateRequest);

const SORTABLE_FIELDS = ["firstName", "lastName", "createdAt", "seeingAgain"] as const;

const listQuerySchema = withDateOrRangeRefinement(z.object({
  ...paginationQuerySchema.shape,
  ...sortQuerySchema(SORTABLE_FIELDS, "createdAt").shape,
  search: z.string().optional(),
  seeing_again: z.enum(["Yes", "No", "Maybe"]).optional(),
  ...dateOrRangeShape,
}));

// GET /api/v1/first-timers — paginated, searchable, sortable first-timer list.
// date / start_date+end_date filter on created_at (UTC day boundaries).
firstTimersV1Router.get(
  "/",
  requireApiPermission("first_timers.view"),
  validateQuery(listQuerySchema),
  async (req, res) => {
    try {
      const q = (req as any).validatedQuery as z.infer<typeof listQuerySchema>;
      const { from, to } = resolveDateRange(q);
      const result = await storage.getFirstTimers(req.scope!, {
        page: q.page,
        limit: q.limit,
        search: q.search,
        seeingAgain: q.seeing_again,
        sortBy: q.sort_by as any,
        sortOrder: q.sort_order,
        dateFrom: from,
        dateTo: to,
      });
      return sendPaginated(res, result.data, { page: result.page, limit: result.limit, total: result.total });
    } catch (error) {
      return handleRouteError(res, error, "Failed to fetch first timers.");
    }
  }
);

firstTimersV1Router.get(
  "/:id",
  requireApiPermission("first_timers.view"),
  validateParams(z.object({ id: idParamSchema })),
  async (req, res) => {
    try {
      const firstTimer = await storage.getFirstTimerById(req.scope!, req.params.id);
      if (!firstTimer) return sendError(res, "NotFound", "First timer not found.");
      return sendSuccess(res, firstTimer);
    } catch (error) {
      return handleRouteError(res, error, "Failed to fetch first timer.");
    }
  }
);

firstTimersV1Router.post(
  "/",
  requireApiPermission("first_timers.create"),
  validateBody(insertFirstTimerSchema),
  async (req, res) => {
    try {
      const firstTimer = await storage.createFirstTimer(req.scope!, (req as any).validatedBody);
      return sendSuccess(res, firstTimer, undefined, 201);
    } catch (error) {
      return handleRouteError(res, error, "Failed to create first timer.");
    }
  }
);

firstTimersV1Router.patch(
  "/:id",
  requireApiPermission("first_timers.create"),
  validateParams(z.object({ id: idParamSchema })),
  validateBody(insertFirstTimerSchema.partial()),
  async (req, res) => {
    try {
      const firstTimer = await storage.updateFirstTimer(req.scope!, req.params.id, (req as any).validatedBody);
      return sendSuccess(res, firstTimer);
    } catch (error) {
      return handleRouteError(res, error, "Failed to update first timer.");
    }
  }
);

firstTimersV1Router.post(
  "/:id/convert",
  requireApiPermission("first_timers.convert"),
  validateParams(z.object({ id: idParamSchema })),
  async (req, res) => {
    try {
      const member = await storage.convertFirstTimerToMember(req.scope!, req.params.id);
      return sendSuccess(res, member, undefined, 201);
    } catch (error) {
      return handleRouteError(res, error, "Failed to convert first timer to member.");
    }
  }
);
