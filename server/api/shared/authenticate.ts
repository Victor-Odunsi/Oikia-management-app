import type { Request, Response, NextFunction, RequestHandler } from "express";
import { apiTokenStorage } from "../../replit_integrations/auth";
import { storage } from "../../storage";
import { sendError } from "./response";
import { resolveUserScope } from "../../authz/scope";

export interface ApiUser {
  id: string;
  email: string | null;
  authType: "session" | "token";
  tokenId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiUser?: ApiUser;
    }
  }
}

const BEARER_PREFIX = "Bearer ";

/**
 * Shared authentication for every /api/v1 protected route. Accepts either:
 *  - Authorization: Bearer <opaque access token> (external integrations), or
 *  - The existing browser session cookie (connect.sid) via Passport
 *
 * On success, attaches a consistent `req.apiUser` regardless of which path
 * was used. On failure, distinguishes missing / invalid / expired / revoked
 * credentials but always returns the same standardized 401 body so callers
 * can't enumerate account state from the error shape.
 */
export const authenticateRequest: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    if (!authHeader.startsWith(BEARER_PREFIX)) {
      return sendError(res, "Unauthorized", "A valid authentication token is required.");
    }

    const rawToken = authHeader.slice(BEARER_PREFIX.length).trim();
    if (!rawToken) {
      return sendError(res, "Unauthorized", "A valid authentication token is required.");
    }

    try {
      const lookup = await apiTokenStorage.lookupByRawToken(rawToken);

      if (lookup.outcome === "not_found") {
        return sendError(res, "Unauthorized", "The access token is invalid.");
      }
      if (lookup.outcome === "revoked") {
        return sendError(res, "Unauthorized", "The access token has been revoked.");
      }
      if (lookup.outcome === "expired") {
        return sendError(res, "Unauthorized", "The access token has expired.");
      }

      const user = await storage.getUserById(lookup.token.userId);
      if (!user) {
        return sendError(res, "Unauthorized", "The access token is invalid.");
      }

      // Fire-and-forget — don't block the request on a last-used timestamp write
      apiTokenStorage.touchLastUsed(lookup.token.id).catch((err) =>
        console.error("[api/v1] failed to update token last_used_at:", err)
      );

      req.apiUser = { id: user.id, email: user.email, authType: "token", tokenId: lookup.token.id };
      return next();
    } catch (error) {
      console.error("[api/v1] token authentication failed:", error);
      return sendError(res, "Unauthorized", "A valid authentication token is required.");
    }
  }

  // Fall back to the existing browser session (connect.sid / Passport)
  const isAuthenticated = (req as any).isAuthenticated as (() => boolean) | undefined;
  if (isAuthenticated && isAuthenticated.call(req)) {
    const sessionUser = req.user as any;
    const userId = sessionUser?.claims?.sub;
    if (userId) {
      req.apiUser = {
        id: userId,
        email: sessionUser?.claims?.email ?? null,
        authType: "session",
      };
      return next();
    }
  }

  return sendError(res, "Unauthorized", "A valid authentication token is required.");
};

export function requireApiRole(...allowedRoles: string[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiUser) {
      return sendError(res, "Unauthorized", "A valid authentication token is required.");
    }
    try {
      const scope = await resolveUserScope(req.apiUser.id);
      if (!scope) {
        return sendError(res, "Forbidden", "No role is assigned to this account.");
      }
      if (!allowedRoles.includes(scope.role)) {
        return sendError(res, "Forbidden", "This account does not have permission to perform this action.");
      }
      req.scope = scope;
      next();
    } catch (error) {
      console.error("[api/v1] role check failed:", error);
      return sendError(res, "InternalError", "Failed to verify account permissions.");
    }
  };
}

export function requireApiPermission(permission: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiUser) {
      return sendError(res, "Unauthorized", "A valid authentication token is required.");
    }
    try {
      const scope = await resolveUserScope(req.apiUser.id);
      if (!scope) {
        return sendError(res, "Forbidden", "No role is assigned to this account.");
      }
      if (scope.role === "super_admin") {
        req.scope = scope;
        return next();
      }
      const rolePermissions = await storage.getRolePermissions();
      const rolePerms = rolePermissions[scope.role] ?? [];
      if (!rolePerms.includes(permission)) {
        return sendError(res, "Forbidden", `This account is missing the '${permission}' permission.`);
      }
      req.scope = scope;
      next();
    } catch (error) {
      console.error("[api/v1] permission check failed:", error);
      return sendError(res, "InternalError", "Failed to verify account permissions.");
    }
  };
}
