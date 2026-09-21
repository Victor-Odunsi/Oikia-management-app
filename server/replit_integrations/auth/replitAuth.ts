import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { storage } from "../../storage";
import { pool } from "../../db";
import { resolveUserScope } from "../../authz/scope";

type UserRoleType = "super_admin" | "branch_admin" | "group_admin" | "cell_leader" | "branch_rep";

// Only two auth modes: Replit OIDC (when hosted on Replit) or password auth
// via /api/signin — used for BOTH local development and production alike.
// There is deliberately no separate no-credential dev path: seed a local
// super_admin with `npx tsx --env-file=.env scripts/seed-super-admin.ts`
// and sign in through the real form, so dev never exercises a different
// code path than production does.
const usesReplitOidc = !!process.env.REPL_ID;

console.log(
  `[auth] mode resolved: ${usesReplitOidc ? "replit-oidc" : "password"} (REPL_ID=${usesReplitOidc ? "set" : "unset"})`
);

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    pool: pool as any,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  if (!usesReplitOidc) {
    // No Replit OIDC — auth is handled by /api/signin and /api/signup routes,
    // in every environment including local development. Bootstrap a local
    // super_admin with scripts/seed-super-admin.ts, then sign in normally.
    passport.serializeUser((user: Express.User, cb) => cb(null, user));
    passport.deserializeUser((user: Express.User, cb) => cb(null, user));
    app.get("/api/logout", (req, res) => {
      req.logout(() => res.redirect("/"));
    });
    console.log("[auth] Password auth mode (no Replit OIDC)");
    return;
  }

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

export const requireRole = (...allowedRoles: UserRoleType[]): RequestHandler => {
  return async (req, res, next) => {
    const user = req.user as any;

    if (!req.isAuthenticated() || !user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const scope = await resolveUserScope(user.claims.sub);

      if (!scope) {
        return res.status(403).json({ message: "Forbidden: No role assigned" });
      }

      if (!allowedRoles.includes(scope.role as UserRoleType)) {
        return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
      }

      req.scope = scope;
      return next();
    } catch (error) {
      console.error("Error checking user role:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
};

// In-memory cache for role permissions to avoid a DB hit on every request
let permissionsCache: { data: Record<string, string[]>; ts: number } | null = null;
const PERM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidatePermissionsCache() {
  permissionsCache = null;
}

async function getCachedPermissions(): Promise<Record<string, string[]>> {
  const now = Date.now();
  if (permissionsCache && now - permissionsCache.ts < PERM_CACHE_TTL) {
    return permissionsCache.data;
  }
  const data = await storage.getRolePermissions();
  permissionsCache = { data, ts: now };
  return data;
}

export const requirePermission = (permission: string): RequestHandler => {
  return async (req, res, next) => {
    const user = req.user as any;

    if (!req.isAuthenticated() || !user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const scope = await resolveUserScope(user.claims.sub);

      if (!scope) {
        return res.status(403).json({ message: "Forbidden: No role assigned" });
      }

      // super_admin always has full access
      if (scope.role === "super_admin") {
        req.scope = scope;
        return next();
      }

      const rolePermissions = await getCachedPermissions();
      const rolePerms = rolePermissions[scope.role] ?? [];

      if (!rolePerms.includes(permission)) {
        return res.status(403).json({ message: `Forbidden: Missing permission '${permission}'` });
      }

      req.scope = scope;
      return next();
    } catch (error) {
      console.error("Error checking permissions:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
};
