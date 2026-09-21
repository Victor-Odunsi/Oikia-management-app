import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { insertAttendanceSchema } from "@shared/schema";
import { sendSuccess, sendPaginated, handleRouteError } from "../shared/response";
import { validateQuery, validateBody, paginationQuerySchema, dateOrRangeShape, withDateOrRangeRefinement, resolveDateRange, idParamSchema } from "../shared/validation";
import { authenticateRequest, requireApiPermission } from "../shared/authenticate";

export const attendanceV1Router = Router();

attendanceV1Router.use(authenticateRequest);

const listQuerySchema = withDateOrRangeRefinement(z.object({
  ...paginationQuerySchema.shape,
  member_id: idParamSchema.optional(),
  status: z.enum(["Present", "Absent"]).optional(),
  ...dateOrRangeShape,
}));

// GET /api/v1/attendance — paginated attendance record list. date /
// start_date+end_date filter on service_date (a calendar date — no timezone
// conversion applies).
attendanceV1Router.get(
  "/",
  requireApiPermission("attendance.view"),
  validateQuery(listQuerySchema),
  async (req, res) => {
    try {
      const q = (req as any).validatedQuery as z.infer<typeof listQuerySchema>;
      const { from, to } = resolveDateRange(q);
      const result = await storage.getAttendanceList(req.scope!, {
        memberId: q.member_id,
        status: q.status,
        dateFrom: from,
        dateTo: to,
        page: q.page,
        limit: q.limit,
      });
      return sendPaginated(res, result.data, { page: result.page, limit: result.limit, total: result.total });
    } catch (error) {
      return handleRouteError(res, error, "Failed to fetch attendance records.");
    }
  }
);

// POST /api/v1/attendance — create or update a single member's attendance
// status for a service date (mirrors the legacy toggle behavior).
attendanceV1Router.post(
  "/",
  requireApiPermission("attendance.edit"),
  validateBody(insertAttendanceSchema),
  async (req, res) => {
    try {
      const { memberId, serviceDate, status } = (req as any).validatedBody;
      const record = await storage.toggleAttendance(req.scope!, memberId, serviceDate, status);
      return sendSuccess(res, record, undefined, 201);
    } catch (error) {
      return handleRouteError(res, error, "Failed to record attendance.");
    }
  }
);
