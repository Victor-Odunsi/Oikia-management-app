import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMemberSchema, insertFirstTimerSchema, insertAttendanceSchema, insertCommunicationSchema, insertFollowUpTaskSchema, insertClusterSchema, insertCellSchema, insertCellAttendanceSchema, insertBranchSchema, insertUserRoleSchema, roleAssignmentSchema, updateUserRoleSchema, signupSchema, insertOutreachSchema, type UserRole } from "@shared/schema";
import { ZodError } from "zod";
import multer from "multer";
import { parse } from "csv-parse";
import { Readable } from "stream";
import { stringify } from "csv-stringify/sync";
import { setupAuth, registerAuthRoutes, isAuthenticated, requireRole, requirePermission, invalidatePermissionsCache } from "./replit_integrations/auth";
import { apiV1Router } from "./api/v1";
import { apiNotFoundHandler } from "./api/notFound";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import crypto from "crypto";
import { UNRESTRICTED_SCOPE, resolveUserScope, type Scope } from "./authz/scope";

// ---------------------------------------------------------------------------
// Encryption helpers for SMTP password storage (AES-256-GCM)
// ---------------------------------------------------------------------------
// Use a dedicated ENCRYPTION_KEY env var. Fall back to SESSION_SECRET only so
// that existing deployments that lack ENCRYPTION_KEY don't crash on startup —
// but emit a clear warning so operators know to add the dedicated key.
// IMPORTANT: if SESSION_SECRET is rotated without setting ENCRYPTION_KEY first,
// any stored SMTP password will become unreadable.
const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
if (!ENCRYPTION_KEY_RAW) {
  throw new Error("Missing required env var: ENCRYPTION_KEY (or SESSION_SECRET as fallback)");
}
if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === "production") {
  console.warn(
    "[security] ENCRYPTION_KEY env var is not set. Falling back to SESSION_SECRET for SMTP " +
    "credential encryption. Set a dedicated ENCRYPTION_KEY to avoid data loss on secret rotation."
  );
}
// Derive a 32-byte AES key via SHA-256 (deterministic from the raw secret)
const ENCRYPTION_KEY = crypto.createHash("sha256").update(ENCRYPTION_KEY_RAW).digest();

function encryptPassword(plaintext: string): string {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptPassword(stored: string): string {
  if (!stored) return "";
  try {
    const [ivHex, tagHex, encHex] = stored.split(":");
    if (!ivHex || !tagHex || !encHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(encHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Default email templates
// ---------------------------------------------------------------------------
const DEFAULT_TEMPLATES: Record<string, { subject: string; htmlContent: string; description: string; variables: string[] }> = {
  signup_confirmation: {
    description: "Sent when a new user registers an account.",
    variables: ["{{firstName}}", "{{lastName}}", "{{email}}"],
    subject: "Welcome to The Waypoint, {{firstName}}!",
    htmlContent: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#f97316;">Welcome to The Waypoint!</h2>
  <p>Hi {{firstName}},</p>
  <p>Thank you for registering. Your account has been created and is pending approval by an administrator.</p>
  <p>You will receive another email once your role has been assigned.</p>
  <p style="color:#6b7280;font-size:12px;">This email was sent to {{email}}</p>
</body>
</html>`,
  },
  password_reset: {
    description: "Sent when a user requests a password reset.",
    variables: ["{{firstName}}", "{{resetLink}}", "{{expiresIn}}"],
    subject: "Reset your password",
    htmlContent: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#f97316;">Password Reset Request</h2>
  <p>Hi {{firstName}},</p>
  <p>We received a request to reset your password. Click the button below to create a new password:</p>
  <a href="{{resetLink}}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">Reset Password</a>
  <p>This link expires in {{expiresIn}}.</p>
  <p>If you did not request this, please ignore this email.</p>
</body>
</html>`,
  },
  password_changed: {
    description: "Sent when a user's password has been changed.",
    variables: ["{{firstName}}", "{{email}}"],
    subject: "Your password has been changed",
    htmlContent: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#f97316;">Password Changed</h2>
  <p>Hi {{firstName}},</p>
  <p>Your account password has been successfully changed.</p>
  <p>If you did not make this change, please contact your administrator immediately.</p>
  <p style="color:#6b7280;font-size:12px;">Account: {{email}}</p>
</body>
</html>`,
  },
  role_assigned: {
    description: "Sent when an administrator assigns a role to a user.",
    variables: ["{{firstName}}", "{{role}}", "{{branchName}}"],
    subject: "Your role has been assigned",
    htmlContent: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#f97316;">Role Assigned</h2>
  <p>Hi {{firstName}},</p>
  <p>An administrator has assigned you the <strong>{{role}}</strong> role at <strong>{{branchName}}</strong>.</p>
  <p>You can now log in and access the Church Management System with your new permissions.</p>
</body>
</html>`,
  },
  general_notification: {
    description: "A general-purpose notification template.",
    variables: ["{{firstName}}", "{{subject}}", "{{message}}"],
    subject: "{{subject}}",
    htmlContent: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#f97316;">{{subject}}</h2>
  <p>Hi {{firstName}},</p>
  <p>{{message}}</p>
  <p style="color:#6b7280;font-size:12px;">— The Waypoint Team</p>
</body>
</html>`,
  },
};

// ---------------------------------------------------------------------------
// Transactional email helper — resolves provider, renders template, sends
// ---------------------------------------------------------------------------
async function sendTransactionalEmail(
  templateName: string,
  variables: Record<string, string>,
  toEmail: string
): Promise<void> {
  const settings = await storage.getSmtpSettings();
  if (!settings || !settings.enabled) return;

  const defaults = DEFAULT_TEMPLATES[templateName];
  if (!defaults) throw new Error(`Unknown email template: ${templateName}`);

  const custom = await storage.getEmailTemplate(templateName);
  let subject = custom?.subject ?? defaults.subject;
  let html = custom?.htmlContent ?? defaults.htmlContent;

  for (const [key, value] of Object.entries(variables)) {
    subject = subject.split(key).join(value);
    html = html.split(key).join(value);
  }

  const decryptedKey = decryptPassword(settings.encryptedPassword);
  const from = `"${settings.fromName}" <${settings.fromEmail}>`;

  if (settings.provider === "resend") {
    const resend = new Resend(decryptedKey);
    const { error } = await resend.emails.send({ from, to: [toEmail], subject, html });
    if (error) throw new Error(error.message);
  } else {
    const secure = settings.security === "ssl";
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure,
      auth: { user: settings.username, pass: decryptedKey },
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({ from, to: toEmail, subject, html });
  }
}

const BCRYPT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — comfortable headroom for a few thousand CSV rows
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Public signup endpoint (no authentication required)
  app.post("/api/signup", async (req, res) => {
    try {
      const validatedData = signupSchema.parse(req.body);

      // Normalize email to lowercase
      const normalizedEmail = validatedData.email.toLowerCase().trim();

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      // Hash the password before storing
      const passwordHash = await hashPassword(validatedData.password);

      // Create user with signup data (normalized email)
      const user = await storage.createSignupUser({
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        gender: validatedData.gender,
        address: validatedData.address,
        phoneNumber: validatedData.phoneNumber,
        email: normalizedEmail,
        branchId: validatedData.branchId,
        passwordHash,
      });
      const { passwordHash: _, ...safeUser } = user;
      res.status(201).json({ message: "Registration successful", user: safeUser });

      // Fire-and-forget — email failure must not break signup
      sendTransactionalEmail("signup_confirmation", {
        "{{firstName}}": user.firstName ?? "",
        "{{lastName}}": user.lastName ?? "",
        "{{email}}": user.email ?? "",
      }, user.email ?? "").catch(err => console.error("[email] signup_confirmation failed:", err));
    } catch (error: any) {
      console.error("Error during signup:", error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      } else {
        res.status(500).json({ error: error.message || "Registration failed" });
      }
    }
  });

  // Public sign-in endpoint (email + password)
  app.post("/api/signin", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const normalizedEmail = (email as string).toLowerCase().trim();
      const user = await storage.getUserByEmail(normalizedEmail);

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Log the user in via passport session
      req.login({ claims: { sub: user.id, email: user.email }, expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 }, async (err) => {
        if (err) return res.status(500).json({ error: "Login failed" });
        await storage.incrementLoginCount(user.id);
        res.json({ message: "Login successful" });
      });
    } catch (error: any) {
      console.error("Error during signin:", error);
      res.status(500).json({ error: "Sign in failed" });
    }
  });

  // POST /api/forgot-password — generate reset token and email a link (public)
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const user = await storage.getUserByEmail((email as string).toLowerCase().trim());
      // Always return success to prevent email enumeration
      if (!user) return res.json({ message: "If an account exists with that email, a reset link has been sent." });

      const token = crypto.randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.setPasswordResetToken(user.id, token, expiry);

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const resetLink = `${baseUrl}/reset-password?token=${token}`;

      sendTransactionalEmail("password_reset", {
        "{{firstName}}": user.firstName ?? "there",
        "{{resetLink}}": resetLink,
        "{{expiresIn}}": "1 hour",
      }, user.email ?? "").catch(err => console.error("[email] password_reset failed:", err));

      res.json({ message: "If an account exists with that email, a reset link has been sent." });
    } catch (error: any) {
      console.error("Error in forgot-password:", error);
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  // POST /api/reset-password — consume token and set new password (public)
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ error: "Token and password are required" });
      if ((password as string).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

      const user = await storage.getUserByResetToken(token as string);
      if (!user) return res.status(400).json({ error: "Invalid or expired reset token" });

      const passwordHash = await hashPassword(password);
      await storage.updatePasswordHash(user.id, passwordHash);
      await storage.clearPasswordResetToken(user.id);

      sendTransactionalEmail("password_changed", {
        "{{firstName}}": user.firstName ?? "there",
        "{{email}}": user.email ?? "",
      }, user.email ?? "").catch(err => console.error("[email] password_changed failed:", err));

      res.json({ message: "Password has been reset successfully." });
    } catch (error: any) {
      console.error("Error in reset-password:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // POST /api/me/change-password — authenticated user changes their own password
  app.post("/api/me/change-password", isAuthenticated, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }
      if ((newPassword as string).length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUserById(userId);
      if (!user || !user.passwordHash) return res.status(400).json({ error: "User not found" });

      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) return res.status(400).json({ error: "Current password is incorrect" });

      const passwordHash = await hashPassword(newPassword);
      await storage.updatePasswordHash(userId, passwordHash);

      sendTransactionalEmail("password_changed", {
        "{{firstName}}": user.firstName ?? "there",
        "{{email}}": user.email ?? "",
      }, user.email ?? "").catch(err => console.error("[email] password_changed failed:", err));

      res.json({ message: "Password changed successfully." });
    } catch (error: any) {
      console.error("Error in change-password:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // Mark onboarding tour as completed for the current user
  app.post("/api/onboarding/complete", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await storage.completeOnboarding(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ error: "Failed to update onboarding status" });
    }
  });

  // Public endpoint to get branches for signup form
  app.get("/api/public/branches", async (req, res) => {
    try {
      const branchList = await storage.getBranches();
      res.json(branchList);
    } catch (error) {
      console.error("Error fetching branches:", error);
      res.status(500).json({ error: "Failed to fetch branches" });
    }
  });

  // Public endpoint to get clusters for first-timer form
  app.get("/api/public/clusters", async (req, res) => {
    try {
      const branchId = req.query.branchId as string | undefined;
      const clusterList = await storage.getClusters(UNRESTRICTED_SCOPE, branchId);
      res.json(clusterList);
    } catch (error) {
      console.error("Error fetching clusters:", error);
      res.status(500).json({ error: "Failed to fetch clusters" });
    }
  });

  // Public endpoint to submit first-timer form
  app.post("/api/public/first-timers", async (req, res) => {
    try {
      const validatedData = insertFirstTimerSchema.parse(req.body);
      const firstTimer = await storage.createFirstTimer(UNRESTRICTED_SCOPE, validatedData);
      res.status(201).json(firstTimer);
    } catch (error) {
      console.error("Error creating first timer:", error);
      res.status(500).json({ error: "Failed to submit form" });
    }
  });

  // Stats endpoint
  app.get("/api/stats", isAuthenticated, async (req: any, res) => {
    try {
      const scope = await resolveUserScope(req.user.claims.sub);
      if (!scope) return res.json({ totalMembers: 0, totalFirstTimers: 0, recentAttendance: 0, newMembersThisMonth: 0 });
      const stats = await storage.getStats(scope);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Analytics endpoints
  // Not gated by requirePermission (every role that can view its own
  // members/attendance should see its own reports); scope is resolved
  // directly and threaded into every underlying query instead, same as
  // /api/branches above.
  app.get("/api/analytics/attendance-trends", isAuthenticated, async (req: any, res) => {
    try {
      const scope = await resolveUserScope(req.user.claims.sub);
      if (!scope) return res.json([]);
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const trends = await storage.getAttendanceTrends(scope, days);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching attendance trends:", error);
      res.status(500).json({ error: "Failed to fetch attendance trends" });
    }
  });

  app.get("/api/analytics/status-distribution", isAuthenticated, async (req: any, res) => {
    try {
      const scope = await resolveUserScope(req.user.claims.sub);
      if (!scope) return res.json([]);
      const distribution = await storage.getMemberStatusDistribution(scope);
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching status distribution:", error);
      res.status(500).json({ error: "Failed to fetch status distribution" });
    }
  });

  app.get("/api/analytics/recent-activity", isAuthenticated, async (req: any, res) => {
    try {
      const scope = await resolveUserScope(req.user.claims.sub);
      if (!scope) return res.json({ recentMembers: [], recentFirstTimers: [] });
      const activity = await storage.getRecentActivity(scope);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      res.status(500).json({ error: "Failed to fetch recent activity" });
    }
  });

  app.get("/api/analytics/executive-summary", isAuthenticated, async (req: any, res) => {
    try {
      const scope = await resolveUserScope(req.user.claims.sub);
      if (!scope) return res.status(403).json({ error: "No role assigned" });
      const data = await storage.getExecutiveSummary(scope);
      res.json(data);
    } catch (error) {
      console.error("Error fetching executive summary:", error);
      res.status(500).json({ error: "Failed to fetch executive summary" });
    }
  });

  app.get("/api/analytics/first-timer-analysis", isAuthenticated, async (req: any, res) => {
    try {
      const scope = await resolveUserScope(req.user.claims.sub);
      if (!scope) return res.status(403).json({ error: "No role assigned" });
      const data = await storage.getFirstTimerAnalysis(scope);
      res.json(data);
    } catch (error) {
      console.error("Error fetching first timer analysis:", error);
      res.status(500).json({ error: "Failed to fetch first timer analysis" });
    }
  });

  app.get("/api/analytics/cell-attendance-analysis", isAuthenticated, async (req: any, res) => {
    try {
      const scope = await resolveUserScope(req.user.claims.sub);
      if (!scope) return res.status(403).json({ error: "No role assigned" });
      const data = await storage.getCellAttendanceAnalysis(scope);
      res.json(data);
    } catch (error) {
      console.error("Error fetching cell attendance analysis:", error);
      res.status(500).json({ error: "Failed to fetch cell attendance analysis" });
    }
  });

  // Communications endpoints
  app.post("/api/communications/send", isAuthenticated, requirePermission("communications.send"), async (req, res) => {
    try {
      const validatedData = insertCommunicationSchema.parse(req.body);
      const communication = await storage.sendBulkCommunication(validatedData);
      res.json(communication);
    } catch (error: any) {
      console.error("Error sending communication:", error);
      res.status(400).json({ error: error.message || "Failed to send communication" });
    }
  });

  app.get("/api/communications", isAuthenticated, requirePermission("communications.send"), async (req, res) => {
    try {
      const communications = await storage.getCommunications();
      res.json(communications);
    } catch (error) {
      console.error("Error fetching communications:", error);
      res.status(500).json({ error: "Failed to fetch communications" });
    }
  });

  // Member duplicate detection and merge
  app.get("/api/members/duplicates", isAuthenticated, requirePermission("members.view"), async (req, res) => {
    try {
      const groups = await storage.findDuplicates(req.scope!);
      console.log(`[duplicates] found ${groups.length} group(s):`, groups.map(g => `${g.reason} (${g.members.length})`));
      res.json(groups);
    } catch (error) {
      console.error("Error finding duplicates:", error);
      res.status(500).json({ error: "Failed to find duplicates" });
    }
  });

  app.post("/api/members/merge", isAuthenticated, requirePermission("members.edit"), async (req, res) => {
    try {
      const { primaryId, duplicateIds } = req.body;
      if (!primaryId || !Array.isArray(duplicateIds) || duplicateIds.length === 0) {
        return res.status(400).json({ error: "primaryId and duplicateIds[] are required" });
      }
      const merged = await storage.mergeMembers(req.scope!, primaryId, duplicateIds);
      res.json(merged);
    } catch (error: any) {
      console.error("Error merging members:", error);
      res.status(500).json({ error: error.message || "Failed to merge members" });
    }
  });

  // Count members matching attendance-based criteria (for smart bulk update preview)
  app.get("/api/members/count-by-criteria", isAuthenticated, requirePermission("members.view"), async (req, res) => {
    try {
      const parseIntParam = (v: unknown) => v !== undefined && v !== "" ? parseInt(v as string, 10) : undefined;
      const criteria = {
        status: req.query.status as string | undefined,
        minAttended: parseIntParam(req.query.minAttended),
        maxAttended: parseIntParam(req.query.maxAttended),
        lastAttendedWithin: parseIntParam(req.query.lastAttendedWithin),
        notAttendedSince: parseIntParam(req.query.notAttendedSince),
        page: 1,
        limit: 1,
      };
      const result = await storage.getMembers(req.scope!, criteria);
      res.json({ count: result.total });
    } catch (error) {
      console.error("Error counting members by criteria:", error);
      res.status(500).json({ error: "Failed to count members" });
    }
  });

  // Bulk update members by attendance criteria (smart bulk update)
  app.patch("/api/members/bulk-by-criteria", isAuthenticated, requirePermission("members.edit"), async (req, res) => {
    try {
      const { criteria, updates } = req.body as {
        criteria: { status?: string; minAttended?: number; maxAttended?: number; lastAttendedWithin?: number; notAttendedSince?: number };
        updates: Record<string, string>;
      };
      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }
      const ids = await storage.getMemberIdsByFilters(req.scope!, criteria);
      if (ids.length === 0) return res.json({ updated: 0 });
      await storage.bulkUpdateMembers(req.scope!, ids, updates);
      res.json({ updated: ids.length });
    } catch (error) {
      console.error("Error bulk updating members by criteria:", error);
      res.status(500).json({ error: "Failed to bulk update members" });
    }
  });

  // Member routes
  app.get("/api/members", isAuthenticated, requirePermission("members.view"), async (req, res) => {
    try {
      const statusesParam = req.query.statuses as string | undefined;
      const archiveStatusesParam = req.query.archiveStatuses as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 200) : 50;
      const parseIntParam = (v: unknown) => v !== undefined && v !== "" ? parseInt(v as string, 10) : undefined;
      const filters = {
        status: req.query.status as string,
        statuses: statusesParam ? statusesParam.split(',').filter(Boolean) : undefined,
        gender: req.query.gender as string,
        occupation: req.query.occupation as string,
        cluster: req.query.cluster as string,
        search: req.query.search as string | undefined,
        page,
        limit,
        minAttended: parseIntParam(req.query.minAttended),
        maxAttended: parseIntParam(req.query.maxAttended),
        lastAttendedWithin: parseIntParam(req.query.lastAttendedWithin),
        notAttendedSince: parseIntParam(req.query.notAttendedSince),
        archiveStatuses: archiveStatusesParam ? archiveStatusesParam.split(',').filter(Boolean) : undefined,
      };
      const result = await storage.getMembers(req.scope!, filters);
      res.json(result);
    } catch (error) {
      console.error("Error fetching members:", error);
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  // Slim member list for dropdowns and attendance (no expensive attendance subqueries)
  app.get("/api/members/list", isAuthenticated, requirePermission("members.view"), async (req, res) => {
    try {
      const membersList = await storage.getMembersList(req.scope!);
      res.json(membersList);
    } catch (error) {
      console.error("Error fetching members list:", error);
      res.status(500).json({ error: "Failed to fetch members list" });
    }
  });

  // CSV routes must come before :id route to prevent "export", "template", "import" from being matched as IDs
  app.get("/api/members/export", isAuthenticated, requirePermission("members.view"), async (req, res) => {
    try {
      const result = await storage.getMembers(req.scope!, { page: 1, limit: 100000 });
      const members = result.data;
      const csvData = stringify(members, {
        header: true,
        columns: [
          { key: "firstName", header: "First Name" },
          { key: "lastName", header: "Last Name" },
          { key: "gender", header: "Gender" },
          { key: "mobilePhone", header: "Mobile Phone" },
          { key: "email", header: "Email" },
          { key: "address", header: "Address" },
          { key: "occupation", header: "Occupation" },
          { key: "joinDate", header: "Join Date" },
          { key: "cluster", header: "Cluster" },
          { key: "followUpWorker", header: "Follow Up Worker" },
          { key: "cell", header: "Cell" },
          { key: "status", header: "Status" },
          { key: "dateOfBirth", header: "Date of Birth" },
          { key: "followUpType", header: "Follow Up Type" },
          { key: "archive", header: "Archive" },
          { key: "summaryNotes", header: "Summary Notes" },
        ],
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=members.csv");
      res.send(csvData);
    } catch (error) {
      console.error("Error exporting members:", error);
      res.status(500).json({ error: "Failed to export members" });
    }
  });

  app.get("/api/members/template", isAuthenticated, requirePermission("members.import"), async (req, res) => {
    try {
      const template = stringify(
        [
          {
            "First Name": "John",
            "Last Name": "Doe",
            "Gender": "Male",
            "Mobile Phone": "+1234567890",
            "Email": "john@example.com",
            "Address": "123 Main St",
            "Occupation": "Workers",
            "Join Date": "2024-01-01",
            "Cluster": "Lekki",
            "Follow Up Worker": "Jane Smith",
            "Cell": "Cell A",
            "Status": "Crowd",
            "Date of Birth": "1990-01-01",
            "Follow Up Type": "General",
            "Archive": "",
            "Summary Notes": "Sample notes",
          },
        ],
        { header: true }
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=members-template.csv");
      res.send(template);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ error: "Failed to generate template" });
    }
  });

  app.post("/api/members/import", isAuthenticated, requirePermission("members.import"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const branchId = req.body.branchId;
      if (!branchId || !branchId.trim()) {
        return res.status(400).json({ error: "Branch is required" });
      }
      if (req.scope!.role !== "super_admin" && branchId !== req.scope!.branchId) {
        return res.status(400).json({ error: "You can only import members into your own branch" });
      }

      const failures: { row: number; field: string; reason: string }[] = [];

      const REQUIRED_FIELDS = [
        { csvCol: "First Name", label: "First Name" },
        { csvCol: "Last Name", label: "Last Name" },
        { csvCol: "Gender", label: "Gender" },
        { csvCol: "Mobile Phone", label: "Mobile Phone" },
        { csvCol: "Occupation", label: "Occupation" },
        { csvCol: "Join Date", label: "Join Date" },
        { csvCol: "Cluster", label: "Cluster" },
        { csvCol: "Status", label: "Status" },
      ];

      const ENUM_FIELDS = [
        { csvCol: "Gender", label: "Gender", allowed: ["Male", "Female"] },
        { csvCol: "Occupation", label: "Occupation", allowed: ["Students", "Workers", "Unemployed", "Self-Employed"] },
        { csvCol: "Status", label: "Status", allowed: ["Crowd", "Potential", "Committed", "Volunteer", "Worker", "Leader"] },
        { csvCol: "Archive", label: "Archive", allowed: ["Active", "Relocated", "Has a church", "Wrong number", "Unreachable", "Not interested"] },
      ];

      const fieldNameMap: Record<string, string> = {
        firstName: "First Name", lastName: "Last Name", gender: "Gender",
        mobilePhone: "Mobile Phone", email: "Email", address: "Address",
        occupation: "Occupation", joinDate: "Join Date", cluster: "Cluster",
        followUpWorker: "Follow Up Worker", cell: "Cell", status: "Status",
        dateOfBirth: "Date of Birth", followUpType: "Follow Up Type",
        archive: "Archive", summaryNotes: "Summary Notes", branchId: "Branch",
      };

      let imported = 0;
      let total = 0;
      let batch: { rowNum: number; data: ReturnType<typeof insertMemberSchema.parse> }[] = [];
      const BATCH_SIZE = 300;

      const flushBatch = async () => {
        if (batch.length === 0) return;
        try {
          await storage.createMembersBatch(batch.map(b => b.data));
          imported += batch.length;
        } catch (err) {
          // Rare (no unique constraints on this table) — fall back to
          // per-row inserts for just this batch to isolate the bad row.
          for (const { rowNum, data } of batch) {
            try {
              await storage.createMember(req.scope!, data);
              imported++;
            } catch (rowErr) {
              const message = rowErr instanceof Error ? rowErr.message : String(rowErr);
              failures.push({ row: rowNum, field: "Unknown", reason: message });
            }
          }
        }
        batch = [];
      };

      const parser = Readable.from(req.file.buffer).pipe(parse({
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
      }));

      let rowNum = 1; // row 1 is the header
      for await (const record of parser as AsyncIterable<Record<string, string>>) {
        rowNum++;
        total++;
        const failuresBefore = failures.length;

        for (const { csvCol, label } of REQUIRED_FIELDS) {
          const val = record[csvCol];
          if (!val || val.trim() === "") {
            failures.push({ row: rowNum, field: label, reason: "Required field is blank" });
          }
        }

        for (const { csvCol, label, allowed } of ENUM_FIELDS) {
          const val = record[csvCol];
          if (val && val.trim() !== "" && !allowed.includes(val.trim())) {
            failures.push({ row: rowNum, field: label, reason: `Invalid value "${val.trim()}". Must be one of: ${allowed.join(", ")}` });
          }
        }

        if (failures.length > failuresBefore) continue;

        try {
          const memberData = {
            firstName: record["First Name"] || record.firstName,
            lastName: record["Last Name"] || record.lastName,
            gender: record["Gender"] || record.gender,
            mobilePhone: record["Mobile Phone"] || record.mobilePhone,
            email: record["Email"] || record.email || "",
            address: record["Address"] || record.address || "",
            occupation: record["Occupation"] || record.occupation,
            joinDate: record["Join Date"] || record.joinDate,
            cluster: record["Cluster"] || record.cluster,
            followUpWorker: record["Follow Up Worker"] || record.followUpWorker || "",
            cell: record["Cell"] || record.cell || "",
            status: record["Status"] || record.status,
            dateOfBirth: record["Date of Birth"] || record.dateOfBirth || "",
            followUpType: record["Follow Up Type"] || record.followUpType || "General",
            archive: record["Archive"] || record.archive || undefined,
            summaryNotes: record["Summary Notes"] || record.summaryNotes || "",
            branchId,
          };

          const validatedData = insertMemberSchema.parse(memberData);
          batch.push({ rowNum, data: validatedData });
          if (batch.length >= BATCH_SIZE) await flushBatch();
        } catch (err) {
          if (err instanceof ZodError) {
            for (const issue of err.issues) {
              const rawField = String(issue.path[0] ?? "Unknown");
              failures.push({ row: rowNum, field: fieldNameMap[rawField] ?? rawField, reason: issue.message });
            }
          } else {
            const message = err instanceof Error ? err.message : String(err);
            failures.push({ row: rowNum, field: "Unknown", reason: message });
            console.error("Error importing member record:", err);
          }
        }
      }
      await flushBatch();

      res.json({ imported, total, failures });
    } catch (error) {
      console.error("Error importing members:", error);
      res.status(500).json({ error: "Failed to import members" });
    }
  });

  // Bulk delete
  app.delete("/api/members/bulk", isAuthenticated, requirePermission("members.delete"), async (req, res) => {
    try {
      const { ids, selectAll, filters } = req.body;
      let targetIds: string[] = ids ?? [];
      if (selectAll && filters) {
        targetIds = await storage.getMemberIdsByFilters(req.scope!, filters);
      }
      if (targetIds.length === 0) return res.status(400).json({ error: "No members selected" });
      await storage.bulkDeleteMembers(req.scope!, targetIds);
      res.json({ deleted: targetIds.length });
    } catch (error) {
      console.error("Error bulk deleting members:", error);
      res.status(500).json({ error: "Failed to bulk delete members" });
    }
  });

  // Bulk update
  app.patch("/api/members/bulk", isAuthenticated, requirePermission("members.edit"), async (req, res) => {
    try {
      const { ids, selectAll, filters, updates } = req.body;
      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }
      let targetIds: string[] = ids ?? [];
      if (selectAll && filters) {
        targetIds = await storage.getMemberIdsByFilters(req.scope!, filters);
      }
      if (targetIds.length === 0) return res.status(400).json({ error: "No members selected" });
      await storage.bulkUpdateMembers(req.scope!, targetIds, updates);
      res.json({ updated: targetIds.length });
    } catch (error) {
      console.error("Error bulk updating members:", error);
      res.status(500).json({ error: "Failed to bulk update members" });
    }
  });

  // Parameterized routes must come after specific routes
  app.get("/api/members/:id", isAuthenticated, requirePermission("members.view"), async (req, res) => {
    try {
      const member = await storage.getMemberById(req.scope!, req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }
      res.json(member);
    } catch (error) {
      console.error("Error fetching member:", error);
      res.status(500).json({ error: "Failed to fetch member" });
    }
  });

  app.post("/api/members", isAuthenticated, requirePermission("members.create"), async (req, res) => {
    try {
      const validatedData = insertMemberSchema.parse(req.body);
      const member = await storage.createMember(req.scope!, validatedData);
      res.json(member);
    } catch (error: any) {
      console.error("Error creating member:", error);
      res.status(400).json({ error: error.message || "Failed to create member" });
    }
  });

  app.patch("/api/members/:id", isAuthenticated, requirePermission("members.edit"), async (req, res) => {
    try {
      const validatedData = insertMemberSchema.partial().parse(req.body);
      const member = await storage.updateMember(req.scope!, req.params.id, validatedData);
      res.json(member);
    } catch (error: any) {
      console.error("Error updating member:", error);
      res.status(400).json({ error: error.message || "Failed to update member" });
    }
  });

  app.delete("/api/members/:id", isAuthenticated, requirePermission("members.delete"), async (req, res) => {
    try {
      await storage.deleteMember(req.scope!, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting member:", error);
      res.status(500).json({ error: "Failed to delete member" });
    }
  });

  // First Timer routes
  app.get("/api/first-timers", isAuthenticated, requirePermission("first_timers.view"), async (req, res) => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 200) : 50;
      const search = req.query.search as string | undefined;
      const seeingAgain = req.query.seeingAgain as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const result = await storage.getFirstTimers(req.scope!, { page, limit, search, seeingAgain, dateFrom, dateTo });
      res.json(result);
    } catch (error) {
      console.error("Error fetching first timers:", error);
      res.status(500).json({ error: "Failed to fetch first timers" });
    }
  });

  app.post("/api/first-timers", isAuthenticated, requirePermission("first_timers.create"), async (req, res) => {
    try {
      console.log("First timer submission received:", req.body);
      const validatedData = insertFirstTimerSchema.parse(req.body);
      console.log("Validation successful, creating first timer");
      const firstTimer = await storage.createFirstTimer(req.scope!, validatedData);
      console.log("First timer created:", firstTimer.id);
      res.json(firstTimer);
    } catch (error: any) {
      console.error("Error creating first timer:", error);
      console.error("Error details:", error.issues || error.message);
      res.status(400).json({ error: error.message || "Failed to create first timer" });
    }
  });

  app.patch("/api/first-timers/:id", isAuthenticated, requirePermission("first_timers.create"), async (req, res) => {
    try {
      const updated = await storage.updateFirstTimer(req.scope!, req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating first timer:", error);
      res.status(400).json({ error: error.message || "Failed to update first timer" });
    }
  });

  app.post("/api/first-timers/:id/convert", isAuthenticated, requirePermission("first_timers.convert"), async (req, res) => {
    try {
      const member = await storage.convertFirstTimerToMember(req.scope!, req.params.id);
      res.json(member);
    } catch (error: any) {
      console.error("Error converting first timer:", error);
      res.status(400).json({ error: error.message || "Failed to convert first timer" });
    }
  });

  app.get("/api/first-timers/export", isAuthenticated, requirePermission("first_timers.view"), async (req, res) => {
    try {
      const { data: firstTimers } = await storage.getFirstTimers(req.scope!, { page: 1, limit: 100000 });
      const csvData = stringify(firstTimers, {
        header: true,
        columns: [
          { key: "firstName", header: "First Name" },
          { key: "lastName", header: "Last Name" },
          { key: "gender", header: "Gender" },
          { key: "mobilePhone", header: "Mobile Phone" },
          { key: "email", header: "Email" },
          { key: "address", header: "Address" },
          { key: "dateOfBirth", header: "Date of Birth" },
          { key: "closestAxis", header: "Closest Axis" },
          { key: "basedInCity", header: "Based In City" },
          { key: "seeingAgain", header: "Seeing Again" },
          { key: "enjoyedAboutService", header: "Enjoyed About Service" },
          { key: "howHeardAbout", header: "How Heard About" },
          { key: "whoInvited", header: "Who Invited" },
          { key: "feedback", header: "Feedback" },
        ],
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=first-timers.csv");
      res.send(csvData);
    } catch (error) {
      console.error("Error exporting first timers:", error);
      res.status(500).json({ error: "Failed to export first timers" });
    }
  });

  app.get("/api/first-timers/template", isAuthenticated, requirePermission("first_timers.create"), async (req, res) => {
    try {
      const template = stringify(
        [
          {
            firstName: "Jane",
            lastName: "Smith",
            gender: "Female",
            mobilePhone: "+1234567890",
            email: "jane@example.com",
            address: "456 Oak Ave",
            dateOfBirth: "1995-05-15",
            closestAxis: "Victoria Island",
            basedInCity: "Yes",
            seeingAgain: "Yes",
            enjoyedAboutService: "Sermon,Prayer",
            howHeardAbout: "Oikia member",
            whoInvited: "John Doe",
            feedback: "Great service!",
          },
        ],
        { header: true }
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=first-timers-template.csv");
      res.send(template);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ error: "Failed to generate template" });
    }
  });

  app.post("/api/first-timers/import", isAuthenticated, requirePermission("first_timers.create"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const failures: { row: number; field: string; reason: string }[] = [];
      const rowBranchId = req.scope!.role === "super_admin" ? undefined : req.scope!.branchId;

      let imported = 0;
      let total = 0;
      let batch: { rowNum: number; data: ReturnType<typeof insertFirstTimerSchema.parse> }[] = [];
      const BATCH_SIZE = 300;

      const flushBatch = async () => {
        if (batch.length === 0) return;
        try {
          await storage.createFirstTimersBatch(batch.map(b => b.data));
          imported += batch.length;
        } catch (err) {
          for (const { rowNum, data } of batch) {
            try {
              await storage.createFirstTimer(req.scope!, data);
              imported++;
            } catch (rowErr) {
              const message = rowErr instanceof Error ? rowErr.message : String(rowErr);
              failures.push({ row: rowNum, field: "Unknown", reason: message });
            }
          }
        }
        batch = [];
      };

      const parser = Readable.from(req.file.buffer).pipe(parse({
        columns: true,
        skip_empty_lines: true,
      }));

      let rowNum = 1; // row 1 is the header
      for await (const record of parser as AsyncIterable<Record<string, string>>) {
        rowNum++;
        total++;
        try {
          const enjoyedArray = (record["Enjoyed About Service"] || record.enjoyedAboutService || "")
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);

          const firstTimerData = {
            firstName: record["First Name"] || record.firstName,
            lastName: record["Last Name"] || record.lastName,
            gender: record["Gender"] || record.gender,
            mobilePhone: record["Mobile Phone"] || record.mobilePhone,
            email: record["Email"] || record.email || "",
            address: record["Address"] || record.address || "",
            dateOfBirth: record["Date of Birth"] || record.dateOfBirth || "",
            closestAxis: record["Closest Axis"] || record.closestAxis,
            basedInCity: record["Based In City"] || record.basedInCity,
            seeingAgain: record["Seeing Again"] || record.seeingAgain,
            enjoyedAboutService: enjoyedArray,
            howHeardAbout: record["How Heard About"] || record.howHeardAbout,
            whoInvited: record["Who Invited"] || record.whoInvited || "",
            feedback: record["Feedback"] || record.feedback || "",
            branchId: rowBranchId,
          };

          const validatedData = insertFirstTimerSchema.parse(firstTimerData);
          batch.push({ rowNum, data: validatedData });
          if (batch.length >= BATCH_SIZE) await flushBatch();
        } catch (err) {
          if (err instanceof ZodError) {
            for (const issue of err.issues) {
              failures.push({ row: rowNum, field: String(issue.path[0] ?? "Unknown"), reason: issue.message });
            }
          } else {
            const message = err instanceof Error ? err.message : String(err);
            failures.push({ row: rowNum, field: "Unknown", reason: message });
            console.error("Error importing first timer record:", err);
          }
        }
      }
      await flushBatch();

      res.json({ imported, total, failures });
    } catch (error) {
      console.error("Error importing first timers:", error);
      res.status(500).json({ error: "Failed to import first timers" });
    }
  });

  // Attendance routes
  app.get("/api/attendance", isAuthenticated, requirePermission("attendance.view"), async (req, res) => {
    try {
      const serviceDate = req.query.serviceDate as string;
      if (!serviceDate) {
        return res.status(400).json({ error: "Service date is required" });
      }
      const attendance = await storage.getAttendanceByDate(req.scope!, serviceDate);
      res.json(attendance);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  });

  app.post("/api/attendance/toggle", isAuthenticated, requirePermission("attendance.edit"), async (req, res) => {
    try {
      const { memberId, serviceDate, status } = req.body;
      const validatedData = insertAttendanceSchema.parse({ memberId, serviceDate, status });
      const attendance = await storage.toggleAttendance(
        req.scope!,
        validatedData.memberId,
        validatedData.serviceDate,
        validatedData.status
      );
      res.json(attendance);
    } catch (error: any) {
      console.error("Error toggling attendance:", error);
      res.status(400).json({ error: error.message || "Failed to toggle attendance" });
    }
  });

  app.post("/api/attendance/mark-all-present", isAuthenticated, requirePermission("attendance.edit"), async (req, res) => {
    try {
      const { serviceDate, status } = req.body;
      if (!serviceDate || !status) {
        return res.status(400).json({ error: "Service date and status are required" });
      }
      await storage.markAllPresentByStatus(req.scope!, serviceDate, status);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all present:", error);
      res.status(500).json({ error: "Failed to mark all present" });
    }
  });

  app.get("/api/attendance/template", isAuthenticated, requirePermission("attendance.view"), async (req, res) => {
    try {
      const template = stringify(
        [
          {
            firstName: "John",
            lastName: "Doe",
            mobilePhone: "+1234567890",
            serviceDate: "2024-01-07",
            status: "Present",
          },
        ],
        { header: true }
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=attendance-template.csv");
      res.send(template);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ error: "Failed to generate template" });
    }
  });

  app.post("/api/attendance/import", isAuthenticated, requirePermission("attendance.edit"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Load all members once before iterating CSV rows
      const allMembers = await storage.getMembersList(req.scope!);
      const failures: { row: number; field: string; reason: string }[] = [];

      const parser = Readable.from(req.file.buffer).pipe(parse({
        columns: true,
        skip_empty_lines: true,
      }));

      const entries: { memberId: string; serviceDate: string; status: string }[] = [];
      let total = 0;
      let rowNum = 1; // row 1 is the header
      for await (const record of parser as AsyncIterable<Record<string, string>>) {
        rowNum++;
        total++;
        const firstName = record["First Name"] || record.firstName;
        const lastName = record["Last Name"] || record.lastName;
        const mobilePhone = record["Mobile Phone"] || record.mobilePhone;
        const serviceDate = record["Service Date"] || record.serviceDate;
        const status = record["Status"] || record.status || "Present";

        // Find member by name and phone
        const member = allMembers.find(
          (m) =>
            m.firstName === firstName &&
            m.lastName === lastName &&
            m.mobilePhone === mobilePhone
        );

        if (member) {
          entries.push({ memberId: member.id, serviceDate, status });
        } else {
          failures.push({ row: rowNum, field: "Unknown", reason: "No matching member found by name and phone" });
        }
      }

      await storage.batchToggleAttendance(entries);

      res.json({ imported: entries.length, total, failures });
    } catch (error) {
      console.error("Error importing attendance:", error);
      res.status(500).json({ error: "Failed to import attendance" });
    }
  });

  // Follow-up Tasks endpoints
  app.get("/api/follow-up-tasks", isAuthenticated, requirePermission("follow_up_tasks.view"), async (req, res) => {
    try {
      const { assignedTo, status, memberId } = req.query;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 200) : 25;
      const result = await storage.getFollowUpTasks(req.scope!, {
        assignedTo: assignedTo as string,
        status: status as string,
        memberId: memberId as string,
        page,
        limit,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching follow-up tasks:", error);
      res.status(500).json({ error: "Failed to fetch follow-up tasks" });
    }
  });

  app.get("/api/follow-up-tasks/:id", isAuthenticated, requirePermission("follow_up_tasks.view"), async (req, res) => {
    try {
      const task = await storage.getFollowUpTaskById(req.scope!, req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      console.error("Error fetching follow-up task:", error);
      res.status(500).json({ error: "Failed to fetch follow-up task" });
    }
  });

  app.post("/api/follow-up-tasks", isAuthenticated, requirePermission("follow_up_tasks.manage"), async (req, res) => {
    try {
      const validatedData = insertFollowUpTaskSchema.parse(req.body);
      const task = await storage.createFollowUpTask(validatedData);
      res.json(task);
    } catch (error: any) {
      console.error("Error creating follow-up task:", error);
      res.status(400).json({ error: error.message || "Failed to create follow-up task" });
    }
  });

  app.patch("/api/follow-up-tasks/:id", isAuthenticated, requirePermission("follow_up_tasks.manage"), async (req, res) => {
    try {
      const validatedData = insertFollowUpTaskSchema.partial().parse(req.body);
      const task = await storage.updateFollowUpTask(req.scope!, req.params.id, validatedData);
      res.json(task);
    } catch (error: any) {
      console.error("Error updating follow-up task:", error);
      res.status(400).json({ error: error.message || "Failed to update follow-up task" });
    }
  });

  app.delete("/api/follow-up-tasks/:id", isAuthenticated, requirePermission("follow_up_tasks.manage"), async (req, res) => {
    try {
      await storage.deleteFollowUpTask(req.scope!, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting follow-up task:", error);
      res.status(500).json({ error: "Failed to delete follow-up task" });
    }
  });

  app.post("/api/follow-up-tasks/:id/complete", isAuthenticated, requirePermission("follow_up_tasks.manage"), async (req, res) => {
    try {
      const task = await storage.completeFollowUpTask(req.scope!, req.params.id);
      res.json(task);
    } catch (error) {
      console.error("Error completing follow-up task:", error);
      res.status(500).json({ error: "Failed to complete follow-up task" });
    }
  });

  // Cluster routes (before cell routes to avoid id conflicts)
  app.get("/api/clusters", isAuthenticated, requirePermission("cells.view"), async (req, res) => {
    try {
      const branchId = req.query.branchId as string | undefined;
      const clusterList = await storage.getClusters(req.scope!, branchId);
      res.json(clusterList);
    } catch (error) {
      console.error("Error fetching clusters:", error);
      res.status(500).json({ error: "Failed to fetch clusters" });
    }
  });

  app.get("/api/clusters/:id", isAuthenticated, requirePermission("cells.view"), async (req, res) => {
    try {
      const cluster = await storage.getClusterById(req.scope!, req.params.id);
      if (!cluster) {
        return res.status(404).json({ error: "Cluster not found" });
      }
      res.json(cluster);
    } catch (error) {
      console.error("Error fetching cluster:", error);
      res.status(500).json({ error: "Failed to fetch cluster" });
    }
  });

  app.post("/api/clusters", isAuthenticated, requirePermission("branches.manage"), async (req, res) => {
    try {
      const validatedData = insertClusterSchema.parse(req.body);
      const cluster = await storage.createCluster(validatedData);
      res.json(cluster);
    } catch (error: any) {
      console.error("Error creating cluster:", error);
      res.status(400).json({ error: error.message || "Failed to create cluster" });
    }
  });

  app.patch("/api/clusters/:id", isAuthenticated, requirePermission("branches.manage"), async (req, res) => {
    try {
      const validatedData = insertClusterSchema.partial().parse(req.body);
      const cluster = await storage.updateCluster(req.scope!, req.params.id, validatedData);
      res.json(cluster);
    } catch (error: any) {
      console.error("Error updating cluster:", error);
      res.status(400).json({ error: error.message || "Failed to update cluster" });
    }
  });

  app.delete("/api/clusters/:id", isAuthenticated, requirePermission("branches.manage"), async (req, res) => {
    try {
      await storage.deleteCluster(req.scope!, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting cluster:", error);
      res.status(400).json({ error: error.message || "Failed to delete cluster" });
    }
  });

  // Cell routes
  app.get("/api/cells", isAuthenticated, requirePermission("cells.view"), async (req, res) => {
    try {
      const clusterId = req.query.clusterId as string | undefined;
      const cells = await storage.getCells(req.scope!, clusterId);
      res.json(cells);
    } catch (error) {
      console.error("Error fetching cells:", error);
      res.status(500).json({ error: "Failed to fetch cells" });
    }
  });

  app.get("/api/cells/:id", isAuthenticated, requirePermission("cells.view"), async (req, res) => {
    try {
      const cell = await storage.getCellById(req.scope!, req.params.id);
      if (!cell) {
        return res.status(404).json({ error: "Cell not found" });
      }
      res.json(cell);
    } catch (error) {
      console.error("Error fetching cell:", error);
      res.status(500).json({ error: "Failed to fetch cell" });
    }
  });

  app.post("/api/cells", isAuthenticated, requirePermission("cells.manage"), async (req, res) => {
    try {
      const validatedData = insertCellSchema.parse(req.body);
      const cell = await storage.createCell(validatedData);
      res.json(cell);
    } catch (error: any) {
      console.error("Error creating cell:", error);
      res.status(400).json({ error: error.message || "Failed to create cell" });
    }
  });

  app.patch("/api/cells/:id", isAuthenticated, requirePermission("cells.manage"), async (req, res) => {
    try {
      const validatedData = insertCellSchema.partial().parse(req.body);
      const cell = await storage.updateCell(req.scope!, req.params.id, validatedData);
      res.json(cell);
    } catch (error: any) {
      console.error("Error updating cell:", error);
      res.status(400).json({ error: error.message || "Failed to update cell" });
    }
  });

  app.delete("/api/cells/:id", isAuthenticated, requirePermission("cells.manage"), async (req, res) => {
    try {
      await storage.deleteCell(req.scope!, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting cell:", error);
      res.status(500).json({ error: "Failed to delete cell" });
    }
  });

  // Cell attendance routes
  app.get("/api/cells/:id/attendance", isAuthenticated, requirePermission("cells.view"), async (req, res) => {
    try {
      const meetingDate = req.query.meetingDate as string | undefined;
      const attendance = await storage.getCellAttendance(req.scope!, req.params.id, meetingDate);
      res.json(attendance);
    } catch (error) {
      console.error("Error fetching cell attendance:", error);
      res.status(500).json({ error: "Failed to fetch cell attendance" });
    }
  });

  app.post("/api/cells/:id/attendance", isAuthenticated, requirePermission("cells.manage"), async (req, res) => {
    try {
      const validatedData = insertCellAttendanceSchema.parse({
        ...req.body,
        cellId: req.params.id,
      });
      const record = await storage.recordCellAttendance(req.scope!, validatedData);
      res.json(record);
    } catch (error: any) {
      console.error("Error recording cell attendance:", error);
      res.status(400).json({ error: error.message || "Failed to record cell attendance" });
    }
  });

  app.get("/api/cells/:id/meeting-dates", isAuthenticated, requirePermission("cells.view"), async (req, res) => {
    try {
      const dates = await storage.getCellMeetingDates(req.params.id);
      res.json(dates);
    } catch (error) {
      console.error("Error fetching meeting dates:", error);
      res.status(500).json({ error: "Failed to fetch meeting dates" });
    }
  });

  app.delete("/api/cell-attendance/:id", isAuthenticated, requirePermission("cells.manage"), async (req, res) => {
    try {
      await storage.deleteCellAttendance(req.scope!, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting cell attendance:", error);
      res.status(500).json({ error: "Failed to delete cell attendance" });
    }
  });

  // Branch routes (protected - requires authentication, mutations require super_admin)
  // Not gated by requirePermission: many different permission holders (a
  // branch_rep creating a member, a branch_admin importing a CSV) all need
  // to know at least their own branch, so this scopes the RESULT instead —
  // every non-super_admin sees only their own branch, never the full list.
  app.get("/api/branches", isAuthenticated, async (req: any, res) => {
    try {
      const scope = await resolveUserScope(req.user.claims.sub);
      const branches = await storage.getBranches();
      if (!scope) return res.json([]);
      if (scope.role === "super_admin") return res.json(branches);
      res.json(branches.filter((b) => b.id === scope.branchId));
    } catch (error) {
      console.error("Error fetching branches:", error);
      res.status(500).json({ error: "Failed to fetch branches" });
    }
  });

  app.get("/api/branches/:id", isAuthenticated, async (req: any, res) => {
    try {
      const branch = await storage.getBranchById(req.params.id);
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      const scope = await resolveUserScope(req.user.claims.sub);
      if (!scope || (scope.role !== "super_admin" && branch.id !== scope.branchId)) {
        return res.status(404).json({ error: "Branch not found" });
      }
      res.json(branch);
    } catch (error) {
      console.error("Error fetching branch:", error);
      res.status(500).json({ error: "Failed to fetch branch" });
    }
  });

  app.post("/api/branches", isAuthenticated, requirePermission("branches.manage"), async (req, res) => {
    try {
      const validatedData = insertBranchSchema.parse(req.body);
      const branch = await storage.createBranch(validatedData);
      res.json(branch);
    } catch (error: any) {
      console.error("Error creating branch:", error);
      res.status(400).json({ error: error.message || "Failed to create branch" });
    }
  });

  app.patch("/api/branches/:id", isAuthenticated, requirePermission("branches.manage"), async (req, res) => {
    try {
      const validatedData = insertBranchSchema.partial().parse(req.body);
      const branch = await storage.updateBranch(req.params.id, validatedData);
      res.json(branch);
    } catch (error: any) {
      console.error("Error updating branch:", error);
      res.status(400).json({ error: error.message || "Failed to update branch" });
    }
  });

  app.delete("/api/branches/:id", isAuthenticated, requirePermission("branches.manage"), async (req, res) => {
    try {
      await storage.deleteBranch(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting branch:", error);
      res.status(500).json({ error: "Failed to delete branch" });
    }
  });

  // Least-privilege guards for role management: users.manage is held by both
  // super_admin and branch_admin, but a branch_admin must stay confined to
  // their own branch and must never be able to grant super_admin — otherwise
  // "branch admin" is really "admin of everything" via this one endpoint.
  function assertNewRoleInScope(scope: Scope, newData: { role: string; branchId?: string | null }) {
    if (scope.role === "super_admin") return;
    if (newData.role === "super_admin") {
      throw new Error("Only a super_admin can grant the super_admin role");
    }
    if (newData.branchId !== scope.branchId) {
      throw new Error("You can only assign roles within your own branch");
    }
  }

  function assertExistingRoleInScope(scope: Scope, existing: UserRole | undefined) {
    if (scope.role === "super_admin" || !existing) return;
    if (existing.role === "super_admin" || existing.branchId !== scope.branchId) {
      throw new Error("You can only manage roles for users in your own branch");
    }
  }

  // User management routes (protected - requires authentication, mutations require super_admin)
  app.get("/api/users", isAuthenticated, requirePermission("users.manage"), async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const scope = req.scope!;
      const visible = scope.role === "super_admin"
        ? users
        : users.filter(u => u.role?.branchId === scope.branchId);
      res.json(visible);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", isAuthenticated, requirePermission("users.manage"), async (req, res) => {
    try {
      const user = await storage.getUserWithRole(req.params.id);
      // Out-of-scope is reported identically to not-found, same as every
      // other scoped lookup — a branch_admin shouldn't learn that a user in
      // another branch exists at all.
      if (!user || (req.scope!.role !== "super_admin" && user.role?.branchId !== req.scope!.branchId)) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.get("/api/users/:id/role", isAuthenticated, requirePermission("users.manage"), async (req, res) => {
    try {
      const role = await storage.getUserRole(req.params.id);
      if (role && req.scope!.role !== "super_admin" && role.branchId !== req.scope!.branchId) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(role || null);
    } catch (error) {
      console.error("Error fetching user role:", error);
      res.status(500).json({ error: "Failed to fetch user role" });
    }
  });

  app.post("/api/user-roles", isAuthenticated, requirePermission("users.manage"), async (req, res) => {
    try {
      const validatedData = roleAssignmentSchema.parse(req.body);
      assertNewRoleInScope(req.scope!, validatedData);
      const existing = await storage.getUserRole(validatedData.userId);
      assertExistingRoleInScope(req.scope!, existing);
      const role = await storage.assignUserRole(validatedData);
      res.json(role);

      // Fire-and-forget role assignment email
      storage.getUserById(validatedData.userId).then(async (user) => {
        if (!user?.email) return;
        const branch = validatedData.branchId ? await storage.getBranchById(validatedData.branchId) : null;
        sendTransactionalEmail("role_assigned", {
          "{{firstName}}": user.firstName ?? "there",
          "{{role}}": validatedData.role ?? "",
          "{{branchName}}": branch?.name ?? "The Waypoint",
        }, user.email).catch(err => console.error("[email] role_assigned failed:", err));
      }).catch(err => console.error("[email] role_assigned lookup failed:", err));
    } catch (error: any) {
      console.error("Error assigning user role:", error);
      res.status(400).json({ error: error.message || "Failed to assign user role" });
    }
  });

  app.patch("/api/user-roles/:id", isAuthenticated, requirePermission("users.manage"), async (req, res) => {
    try {
      const validatedData = updateUserRoleSchema.parse(req.body);
      const existing = await storage.getUserRoleById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Role assignment not found" });
      }
      assertExistingRoleInScope(req.scope!, existing);
      assertNewRoleInScope(req.scope!, {
        role: validatedData.role ?? existing.role,
        branchId: validatedData.branchId ?? existing.branchId,
      });
      const role = await storage.updateUserRole(req.params.id, validatedData);
      res.json(role);
    } catch (error: any) {
      console.error("Error updating user role:", error);
      res.status(400).json({ error: error.message || "Failed to update user role" });
    }
  });

  app.delete("/api/user-roles/:id", isAuthenticated, requirePermission("users.manage"), async (req, res) => {
    try {
      const existing = await storage.getUserRoleById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Role assignment not found" });
      }
      assertExistingRoleInScope(req.scope!, existing);
      await storage.deleteUserRole(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting user role:", error);
      res.status(error.message ? 400 : 500).json({ error: error.message || "Failed to delete user role" });
    }
  });

  // Get current user's role and permissions (protected)
  app.get("/api/me/role", isAuthenticated, async (req: any, res) => {
    try {
      const userWithRole = await storage.getUserWithRole(req.user.claims.sub);
      res.json(userWithRole || null);
    } catch (error) {
      console.error("Error fetching current user role:", error);
      res.status(500).json({ error: "Failed to fetch current user role" });
    }
  });

  // ==================== REPORTING API ENDPOINTS ====================
  // These endpoints are designed for third-party reporting tools
  // All endpoints require super_admin role for full data access
  // POST endpoints allow creating members and first-timers

  // GET all members (for reporting)
  app.get("/api/reporting/members", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const members = await storage.getMembers(req.scope!, {});
      res.json(members);
    } catch (error) {
      console.error("Error fetching members for reporting:", error);
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  // POST create member (for reporting/external systems)
  app.post("/api/reporting/members", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const validatedData = insertMemberSchema.parse(req.body);
      const member = await storage.createMember(req.scope!, validatedData);
      res.status(201).json(member);
    } catch (error: any) {
      console.error("Error creating member via reporting API:", error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      } else {
        res.status(500).json({ error: error.message || "Failed to create member" });
      }
    }
  });

  // GET all first-timers (for reporting)
  app.get("/api/reporting/first-timers", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const firstTimers = await storage.getFirstTimers(req.scope!);
      res.json(firstTimers);
    } catch (error) {
      console.error("Error fetching first-timers for reporting:", error);
      res.status(500).json({ error: "Failed to fetch first-timers" });
    }
  });

  // POST create first-timer (for reporting/external systems)
  app.post("/api/reporting/first-timers", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const validatedData = insertFirstTimerSchema.parse(req.body);
      const firstTimer = await storage.createFirstTimer(req.scope!, validatedData);
      res.status(201).json(firstTimer);
    } catch (error: any) {
      console.error("Error creating first-timer via reporting API:", error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      } else {
        res.status(500).json({ error: error.message || "Failed to create first-timer" });
      }
    }
  });

  // GET all attendance records (for reporting)
  app.get("/api/reporting/attendance", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const attendance = await storage.getAttendance(req.scope!, {});
      res.json(attendance);
    } catch (error) {
      console.error("Error fetching attendance for reporting:", error);
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  });

  // GET all communications (for reporting)
  app.get("/api/reporting/communications", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const communications = await storage.getCommunications();
      res.json(communications);
    } catch (error) {
      console.error("Error fetching communications for reporting:", error);
      res.status(500).json({ error: "Failed to fetch communications" });
    }
  });

  // GET all follow-up tasks (for reporting)
  app.get("/api/reporting/follow-up-tasks", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const tasks = await storage.getFollowUpTasks(req.scope!, {});
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching follow-up tasks for reporting:", error);
      res.status(500).json({ error: "Failed to fetch follow-up tasks" });
    }
  });

  // GET all cells (for reporting)
  app.get("/api/reporting/cells", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const cells = await storage.getCells(req.scope!);
      res.json(cells);
    } catch (error) {
      console.error("Error fetching cells for reporting:", error);
      res.status(500).json({ error: "Failed to fetch cells" });
    }
  });

  // GET single cell by ID (for reporting)
  app.get("/api/reporting/cells/:id", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const cell = await storage.getCellById(req.scope!, req.params.id);
      if (!cell) return res.status(404).json({ error: "Cell not found" });
      res.json(cell);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cell" });
    }
  });

  // POST create cell (for reporting/external systems)
  app.post("/api/reporting/cells", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const validatedData = insertCellSchema.parse(req.body);
      const cell = await storage.createCell(validatedData);
      res.status(201).json(cell);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      res.status(500).json({ error: error.message || "Failed to create cell" });
    }
  });

  // PATCH update cell (for reporting/external systems)
  app.patch("/api/reporting/cells/:id", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const validatedData = insertCellSchema.partial().parse(req.body);
      const cell = await storage.updateCell(req.scope!, req.params.id, validatedData);
      res.json(cell);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      res.status(500).json({ error: error.message || "Failed to update cell" });
    }
  });

  // GET all cell attendance (for reporting)
  app.get("/api/reporting/cell-attendance", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const cellAttendance = await storage.getAllCellAttendance(req.scope!);
      res.json(cellAttendance);
    } catch (error) {
      console.error("Error fetching cell attendance for reporting:", error);
      res.status(500).json({ error: "Failed to fetch cell attendance" });
    }
  });

  // GET all branches (for reporting)
  app.get("/api/reporting/branches", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const branches = await storage.getBranches();
      res.json(branches);
    } catch (error) {
      console.error("Error fetching branches for reporting:", error);
      res.status(500).json({ error: "Failed to fetch branches" });
    }
  });

  // GET single branch by ID (for reporting)
  app.get("/api/reporting/branches/:id", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const branch = await storage.getBranchById(req.params.id);
      if (!branch) return res.status(404).json({ error: "Branch not found" });
      res.json(branch);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch branch" });
    }
  });

  // POST create branch (for reporting/external systems)
  app.post("/api/reporting/branches", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const validatedData = insertBranchSchema.parse(req.body);
      const branch = await storage.createBranch(validatedData);
      res.status(201).json(branch);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      res.status(500).json({ error: error.message || "Failed to create branch" });
    }
  });

  // PATCH update branch (for reporting/external systems)
  app.patch("/api/reporting/branches/:id", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const validatedData = insertBranchSchema.partial().parse(req.body);
      const branch = await storage.updateBranch(req.params.id, validatedData);
      res.json(branch);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      res.status(500).json({ error: error.message || "Failed to update branch" });
    }
  });

  // GET all users (for reporting)
  app.get("/api/reporting/users", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const users = await storage.getUsers();
      const safeUsers = users.map(({ passwordHash: _, ...u }) => u);
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users for reporting:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // GET all clusters (for reporting)
  app.get("/api/reporting/clusters", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const clusterList = await storage.getClusters(req.scope!);
      res.json(clusterList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch clusters" });
    }
  });

  // GET single cluster by ID (for reporting)
  app.get("/api/reporting/clusters/:id", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const cluster = await storage.getClusterById(req.scope!, req.params.id);
      if (!cluster) return res.status(404).json({ error: "Cluster not found" });
      res.json(cluster);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cluster" });
    }
  });

  // POST create cluster (for reporting/external systems)
  app.post("/api/reporting/clusters", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const validatedData = insertClusterSchema.parse(req.body);
      const cluster = await storage.createCluster(validatedData);
      res.status(201).json(cluster);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      res.status(500).json({ error: error.message || "Failed to create cluster" });
    }
  });

  // PATCH update cluster (for reporting/external systems)
  app.patch("/api/reporting/clusters/:id", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const validatedData = insertClusterSchema.partial().parse(req.body);
      const cluster = await storage.updateCluster(req.scope!, req.params.id, validatedData);
      res.json(cluster);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      res.status(500).json({ error: error.message || "Failed to update cluster" });
    }
  });

  // GET all user roles (for reporting)
  app.get("/api/reporting/user-roles", isAuthenticated, requireRole("super_admin"), async (req, res) => {
    try {
      const userRoles = await storage.getAllUserRoles();
      res.json(userRoles);
    } catch (error) {
      console.error("Error fetching user roles for reporting:", error);
      res.status(500).json({ error: "Failed to fetch user roles" });
    }
  });

  // Role Permissions
  app.get("/api/role-permissions", isAuthenticated, async (req, res) => {
    try {
      const data = await storage.getRolePermissions();
      res.json(data);
    } catch (error) {
      console.error("Error fetching role permissions:", error);
      res.status(500).json({ error: "Failed to fetch role permissions" });
    }
  });

  app.put("/api/role-permissions", isAuthenticated, requirePermission("roles.manage"), async (req, res) => {
    try {
      const data = req.body as Record<string, string[]>;
      await storage.setRolePermissions(data);
      invalidatePermissionsCache();
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving role permissions:", error);
      res.status(500).json({ error: "Failed to save role permissions" });
    }
  });

  // Outreach routes
  app.get("/api/outreach", isAuthenticated, requirePermission("outreach.view"), async (req, res) => {
    try {
      const branchId = req.query.branchId as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 200) : 50;
      const result = await storage.getOutreach(req.scope!, { branchId, page, limit });
      res.json(result);
    } catch (error) {
      console.error("Error fetching outreach:", error);
      res.status(500).json({ error: "Failed to fetch outreach records" });
    }
  });

  app.post("/api/outreach", isAuthenticated, requirePermission("outreach.manage"), async (req, res) => {
    try {
      const data = insertOutreachSchema.parse(req.body);
      const record = await storage.createOutreach(req.scope!, data);
      res.status(201).json(record);
    } catch (error: any) {
      if (error.name === "ZodError") {
        res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      } else {
        res.status(500).json({ error: "Failed to create outreach record" });
      }
    }
  });

  app.patch("/api/outreach/:id", isAuthenticated, requirePermission("outreach.manage"), async (req, res) => {
    try {
      const data = insertOutreachSchema.partial().parse(req.body);
      const record = await storage.updateOutreach(req.scope!, req.params.id, data);
      res.json(record);
    } catch (error: any) {
      if (error.name === "ZodError") {
        res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      } else {
        res.status(500).json({ error: "Failed to update outreach record" });
      }
    }
  });

  app.delete("/api/outreach/:id", isAuthenticated, requirePermission("outreach.manage"), async (req, res) => {
    try {
      await storage.deleteOutreach(req.scope!, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete outreach record" });
    }
  });

  // -------------------------------------------------------------------------
  // Admin: SMTP Settings
  // -------------------------------------------------------------------------

  // GET /api/admin/smtp-settings — return settings without the raw password
  app.get("/api/admin/smtp-settings", isAuthenticated, requireRole("super_admin", "branch_admin"), async (req, res) => {
    try {
      const settings = await storage.getSmtpSettings();
      if (!settings) return res.json(null);
      // Never expose the encrypted password to the client
      const { encryptedPassword: _, ...safeSettings } = settings;
      res.json({ ...safeSettings, hasPassword: !!settings.encryptedPassword });
    } catch (error) {
      res.status(500).json({ error: "Failed to load SMTP settings" });
    }
  });

  // POST /api/admin/smtp-settings — save settings (encrypt password/API key if provided)
  app.post("/api/admin/smtp-settings", isAuthenticated, requireRole("super_admin", "branch_admin"), async (req, res) => {
    try {
      const { provider, host, port, username, password, fromEmail, fromName, security, enabled } = req.body;
      const resolvedProvider: "smtp" | "resend" = provider === "resend" ? "resend" : "smtp";

      if (!fromEmail || !fromName) {
        return res.status(400).json({ error: "From email and from name are required" });
      }

      if (resolvedProvider === "smtp" && (!host || !username)) {
        return res.status(400).json({ error: "Host and username are required for SMTP" });
      }

      // If no new password/key provided, keep the existing encrypted one
      let encryptedPassword = "";
      if (password) {
        encryptedPassword = encryptPassword(password);
      } else {
        const existing = await storage.getSmtpSettings();
        encryptedPassword = existing?.encryptedPassword ?? "";
      }

      const saved = await storage.upsertSmtpSettings({
        provider: resolvedProvider,
        host: resolvedProvider === "resend" ? "" : (host || ""),
        port: resolvedProvider === "resend" ? 0 : (parseInt(port) || 587),
        username: resolvedProvider === "resend" ? "" : (username || ""),
        encryptedPassword,
        fromEmail,
        fromName,
        security: resolvedProvider === "resend" ? "none" : (security || "starttls"),
        enabled: enabled === true || enabled === "true",
      });

      const { encryptedPassword: __, ...safeSettings } = saved;
      res.json({ ...safeSettings, hasPassword: !!saved.encryptedPassword });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to save SMTP settings" });
    }
  });

  // POST /api/admin/smtp-settings/test — verify credentials work
  app.post("/api/admin/smtp-settings/test", isAuthenticated, requireRole("super_admin", "branch_admin"), async (req, res) => {
    try {
      const { provider, host, port, username, password, security } = req.body;

      // Resolve the password/key: use supplied value or fall back to the stored one
      let resolvedPassword = password as string | undefined;
      if (!resolvedPassword) {
        const existing = await storage.getSmtpSettings();
        if (existing?.encryptedPassword) {
          resolvedPassword = decryptPassword(existing.encryptedPassword);
        }
      }

      if (provider === "resend") {
        if (!resolvedPassword) {
          return res.status(400).json({ error: "Resend API key is required" });
        }
        const resend = new Resend(resolvedPassword);
        // Validate by listing API keys — throws on invalid key
        await resend.apiKeys.list();
        return res.json({ success: true, message: "Resend API key is valid." });
      }

      // SMTP path
      if (!host || !username) {
        return res.status(400).json({ error: "Host and username are required" });
      }

      const portNum = parseInt(port) || 587;
      const secure = security === "ssl";

      const transporter = nodemailer.createTransport({
        host,
        port: portNum,
        secure,
        auth: { user: username, pass: resolvedPassword || "" },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
      });

      await transporter.verify();
      res.json({ success: true, message: "Connection successful! SMTP credentials are valid." });
    } catch (error: any) {
      res.status(400).json({ success: false, error: `Connection failed: ${error.message}` });
    }
  });

  // POST /api/admin/smtp-settings/send-test — send a test email
  app.post("/api/admin/smtp-settings/send-test", isAuthenticated, requireRole("super_admin", "branch_admin"), async (req, res) => {
    try {
      const { toEmail } = req.body;
      if (!toEmail) return res.status(400).json({ error: "Recipient email is required" });

      const settings = await storage.getSmtpSettings();
      if (!settings || !settings.enabled) {
        return res.status(400).json({ error: "Email is not configured or disabled" });
      }

      const decryptedKey = decryptPassword(settings.encryptedPassword);
      const mailOptions = {
        from: `"${settings.fromName}" <${settings.fromEmail}>`,
        to: toEmail,
        subject: "Test Email from The Waypoint CMS",
        html: `<p>This is a test email from <strong>The Waypoint Church Management System</strong>.</p><p>If you received this, your email configuration is working correctly.</p>`,
      };

      if (settings.provider === "resend") {
        const resend = new Resend(decryptedKey);
        const { error } = await resend.emails.send({
          from: mailOptions.from,
          to: [toEmail],
          subject: mailOptions.subject,
          html: mailOptions.html,
        });
        if (error) throw new Error(error.message);
      } else {
        const secure = settings.security === "ssl";
        const transporter = nodemailer.createTransport({
          host: settings.host,
          port: settings.port,
          secure,
          auth: { user: settings.username, pass: decryptedKey },
          tls: { rejectUnauthorized: false },
        });
        await transporter.sendMail(mailOptions);
      }

      res.json({ success: true, message: `Test email sent to ${toEmail}` });
    } catch (error: any) {
      res.status(500).json({ error: `Failed to send test email: ${error.message}` });
    }
  });

  // -------------------------------------------------------------------------
  // Admin: Email Templates
  // -------------------------------------------------------------------------

  // GET /api/admin/email-templates — list available template names with metadata
  app.get("/api/admin/email-templates", isAuthenticated, requireRole("super_admin", "branch_admin"), async (req, res) => {
    try {
      const templateList = Object.entries(DEFAULT_TEMPLATES).map(([name, meta]) => ({
        name,
        description: meta.description,
        variables: meta.variables,
      }));
      res.json(templateList);
    } catch (error) {
      res.status(500).json({ error: "Failed to list templates" });
    }
  });

  // GET /api/admin/email-templates/:name — get a specific template (custom or default)
  app.get("/api/admin/email-templates/:name", isAuthenticated, requireRole("super_admin", "branch_admin"), async (req, res) => {
    try {
      const { name } = req.params;
      if (!DEFAULT_TEMPLATES[name]) return res.status(404).json({ error: "Template not found" });

      const custom = await storage.getEmailTemplate(name);
      const defaults = DEFAULT_TEMPLATES[name];

      res.json({
        name,
        subject: custom?.subject ?? defaults.subject,
        htmlContent: custom?.htmlContent ?? defaults.htmlContent,
        description: defaults.description,
        variables: defaults.variables,
        isCustomized: !!custom,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to load template" });
    }
  });

  // POST /api/admin/email-templates/:name — save a customised template
  app.post("/api/admin/email-templates/:name", isAuthenticated, requireRole("super_admin", "branch_admin"), async (req, res) => {
    try {
      const { name } = req.params;
      if (!DEFAULT_TEMPLATES[name]) return res.status(404).json({ error: "Template not found" });

      const { subject, htmlContent } = req.body;
      if (!subject || !htmlContent) return res.status(400).json({ error: "Subject and HTML content are required" });

      const saved = await storage.upsertEmailTemplate(name, { subject, htmlContent });
      const defaults = DEFAULT_TEMPLATES[name];
      res.json({ ...saved, description: defaults.description, variables: defaults.variables, isCustomized: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to save template" });
    }
  });

  // DELETE /api/admin/email-templates/:name — reset to default
  app.delete("/api/admin/email-templates/:name", isAuthenticated, requireRole("super_admin", "branch_admin"), async (req, res) => {
    try {
      const { name } = req.params;
      if (!DEFAULT_TEMPLATES[name]) return res.status(404).json({ error: "Template not found" });

      const existing = await storage.getEmailTemplate(name);
      if (existing) {
        // Remove the custom template — we import db and emailTemplates here lazily
        const { db } = await import("./db");
        const { emailTemplates } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(emailTemplates).where(eq(emailTemplates.id, existing.id));
      }

      const defaults = DEFAULT_TEMPLATES[name];
      res.json({ name, ...defaults, isCustomized: false });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to reset template" });
    }
  });

  // POST /api/admin/send-notification — send a general notification to a user
  app.post("/api/admin/send-notification", isAuthenticated, requireRole("super_admin", "branch_admin"), async (req, res) => {
    try {
      const { userId, email, subject, message } = req.body;
      if ((!userId && !email) || !subject || !message) {
        return res.status(400).json({ error: "Recipient (userId or email), subject, and message are required" });
      }

      let toEmail: string = email ?? "";
      let firstName = "";

      if (userId) {
        const user = await storage.getUserById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        toEmail = user.email ?? toEmail;
        firstName = user.firstName ?? "";
      }

      if (!toEmail) return res.status(400).json({ error: "Could not resolve recipient email" });

      await sendTransactionalEmail("general_notification", {
        "{{firstName}}": firstName || "there",
        "{{subject}}": subject,
        "{{message}}": message,
      }, toEmail);

      res.json({ message: "Notification sent successfully." });
    } catch (error: any) {
      console.error("Error sending notification:", error);
      res.status(500).json({ error: error.message || "Failed to send notification" });
    }
  });

  // Standardized, versioned API surface for external integrations. Mounted
  // after every legacy /api/* route above so it can never shadow one, and
  // (per app.ts) registerRoutes() fully completes before the frontend's SPA
  // catch-all is wired in, so /api/v1 always wins over that too.
  app.use("/api/v1", apiV1Router);

  // Any /api/* path that didn't match a legacy or v1 route above must return
  // JSON, never fall through to the SPA catch-all's index.html.
  app.use("/api", apiNotFoundHandler);

  const httpServer = createServer(app);
  return httpServer;
}
