import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { insertMemberSchema } from "@shared/schema";
import { sendSuccess, sendPaginated, sendError, handleRouteError } from "../shared/response";
import { validateQuery, validateBody, validateParams, paginationQuerySchema, sortQuerySchema, idParamSchema, dateOrRangeShape, withDateOrRangeRefinement, resolveDateRange } from "../shared/validation";
import { authenticateRequest, requireApiPermission } from "../shared/authenticate";

export const membersV1Router = Router();

membersV1Router.use(authenticateRequest);

const SORTABLE_FIELDS = ["firstName", "lastName", "joinDate", "status", "createdAt", "updatedAt"] as const;

const listQuerySchema = withDateOrRangeRefinement(z.object({
  ...paginationQuerySchema.shape,
  ...sortQuerySchema(SORTABLE_FIELDS, "firstName").shape,
  search: z.string().optional(),
  status: z.string().optional(),
  gender: z.enum(["Male", "Female"]).optional(),
  occupation: z.enum(["Students", "Workers", "Unemployed", "Self-Employed"]).optional(),
  cluster: z.string().optional(),
  ...dateOrRangeShape,
}));

// GET /api/v1/members — paginated, searchable, sortable member list.
// date / start_date+end_date filter on join_date (a calendar date, not a
// timestamp — no timezone conversion applies).
membersV1Router.get(
  "/",
  requireApiPermission("members.view"),
  validateQuery(listQuerySchema),
  async (req, res) => {
    try {
      const q = (req as any).validatedQuery as z.infer<typeof listQuerySchema>;
      const { from, to } = resolveDateRange(q);
      const result = await storage.getMembers(req.scope!, {
        search: q.search,
        status: q.status,
        gender: q.gender,
        occupation: q.occupation,
        cluster: q.cluster,
        page: q.page,
        limit: q.limit,
        sortBy: q.sort_by as any,
        sortOrder: q.sort_order,
        joinDateFrom: from,
        joinDateTo: to,
      });
      return sendPaginated(res, result.data, { page: result.page, limit: result.limit, total: result.total });
    } catch (error) {
      return handleRouteError(res, error, "Failed to fetch members.");
    }
  }
);

membersV1Router.get(
  "/:id",
  requireApiPermission("members.view"),
  validateParams(z.object({ id: idParamSchema })),
  async (req, res) => {
    try {
      const member = await storage.getMemberById(req.scope!, req.params.id);
      if (!member) return sendError(res, "NotFound", "Member not found.");
      return sendSuccess(res, member);
    } catch (error) {
      return handleRouteError(res, error, "Failed to fetch member.");
    }
  }
);

membersV1Router.post(
  "/",
  requireApiPermission("members.create"),
  validateBody(insertMemberSchema),
  async (req, res) => {
    try {
      const member = await storage.createMember(req.scope!, (req as any).validatedBody);
      return sendSuccess(res, member, undefined, 201);
    } catch (error) {
      return handleRouteError(res, error, "Failed to create member.");
    }
  }
);

membersV1Router.patch(
  "/:id",
  requireApiPermission("members.edit"),
  validateParams(z.object({ id: idParamSchema })),
  validateBody(insertMemberSchema.partial()),
  async (req, res) => {
    try {
      const member = await storage.updateMember(req.scope!, req.params.id, (req as any).validatedBody);
      return sendSuccess(res, member);
    } catch (error) {
      return handleRouteError(res, error, "Failed to update member.");
    }
  }
);

membersV1Router.delete(
  "/:id",
  requireApiPermission("members.delete"),
  validateParams(z.object({ id: idParamSchema })),
  async (req, res) => {
    try {
      await storage.deleteMember(req.scope!, req.params.id);
      return sendSuccess(res, { deleted: true });
    } catch (error) {
      return handleRouteError(res, error, "Failed to delete member.");
    }
  }
);
