import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, date, integer, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Export auth schema
export * from "./models/auth";

export const members = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: text("gender").notNull(),
  mobilePhone: text("mobile_phone").notNull(),
  email: text("email"),
  address: text("address"),
  occupation: text("occupation").notNull(),
  joinDate: date("join_date").notNull(),
  cluster: text("cluster").notNull(),
  followUpWorker: text("follow_up_worker"),
  cell: text("cell"),
  status: text("status").notNull().default('Crowd'),
  dateOfBirth: date("date_of_birth"),
  followUpType: text("follow_up_type"),
  archive: text("archive"),
  summaryNotes: text("summary_notes"),
  branchId: varchar("branch_id").references(() => branches.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  statusIdx: index("members_status_idx").on(t.status),
  clusterIdx: index("members_cluster_idx").on(t.cluster),
  branchIdIdx: index("members_branch_id_idx").on(t.branchId),
}));

export const firstTimers = pgTable("first_timers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: text("gender").notNull(),
  mobilePhone: text("mobile_phone").notNull(),
  email: text("email"),
  address: text("address"),
  dateOfBirth: date("date_of_birth"),
  closestAxis: text("closest_axis").notNull(),
  basedInCity: text("based_in_city").notNull(),
  seeingAgain: text("seeing_again").notNull(),
  enjoyedAboutService: text("enjoyed_about_service").array().notNull(),
  howHeardAbout: text("how_heard_about").notNull(),
  whoInvited: text("who_invited"),
  feedback: text("feedback"),
  branchId: varchar("branch_id").references(() => branches.id),
  convertedToMember: timestamp("converted_to_member"),
  memberId: varchar("member_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const attendance = pgTable("attendance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => members.id, { onDelete: 'cascade' }),
  serviceDate: date("service_date").notNull(),
  status: text("status").notNull().default('Absent'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  memberIdStatusIdx: index("attendance_member_id_status_idx").on(t.memberId, t.status),
  serviceDateIdx: index("attendance_service_date_idx").on(t.serviceDate),
}));

export const communications = pgTable("communications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'SMS' or 'Email'
  subject: text("subject"),
  message: text("message").notNull(),
  recipientCount: integer("recipient_count").notNull(),
  filters: text("filters").notNull(), // JSON string of applied filters
  sentBy: text("sent_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const followUpTasks = pgTable("follow_up_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => members.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  assignedTo: text("assigned_to").notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull().default('Pending'),
  priority: text("priority").notNull().default('Medium'),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  statusIdx: index("follow_up_tasks_status_idx").on(t.status),
  assignedToIdx: index("follow_up_tasks_assigned_to_idx").on(t.assignedTo),
  memberIdIdx: index("follow_up_tasks_member_id_idx").on(t.memberId),
  dueDateIdx: index("follow_up_tasks_due_date_idx").on(t.dueDate),
}));

export const clusters = pgTable("clusters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  branchId: varchar("branch_id").notNull().references(() => branches.id, { onDelete: 'cascade' }),
  leader: text("leader"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cells = pgTable("cells", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  clusterId: varchar("cluster_id").notNull().references(() => clusters.id, { onDelete: 'cascade' }),
  leader: text("leader"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cellAttendance = pgTable("cell_attendance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cellId: varchar("cell_id").notNull().references(() => cells.id, { onDelete: 'cascade' }),
  memberId: varchar("member_id").notNull().references(() => members.id, { onDelete: 'cascade' }),
  meetingDate: date("meeting_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Branches table - for different church locations
export const branches = pgTable("branches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User roles enum values
// super_admin: Senior Pastor & Global Head - full access to everything
// branch_admin: Resident Pastors - view all data for their branch
// group_admin: Cell Group/Cluster Leads - manage cell leaders, view assigned cells
// cell_leader: Cell Leaders - basic user, manage their cell only
// branch_rep: Branch Representatives - view/edit branch data, no role management
export const userRoleEnum = ['super_admin', 'branch_admin', 'group_admin', 'cell_leader', 'branch_rep'] as const;

// Role permissions table - which permissions each role has
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  role: text("role").notNull(),
  permission: text("permission").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User roles table - assigns roles to users with optional branch/cell scope
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull(), // one of userRoleEnum values
  branchId: varchar("branch_id").references(() => branches.id, { onDelete: 'cascade' }),
  clusterId: text("cluster_id"), // for group_admin - which cluster they manage
  cellId: varchar("cell_id").references(() => cells.id, { onDelete: 'cascade' }), // for cell_leader
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index("user_roles_user_id_idx").on(t.userId),
}));

export const insertMemberSchema = createInsertSchema(members, {
  email: z.string().email().optional().or(z.literal('')),
  mobilePhone: z.string().min(1, "Mobile phone is required"),
  gender: z.enum(['Male', 'Female']),
  occupation: z.enum(['Students', 'Workers', 'Unemployed', 'Self-Employed']),
  status: z.enum(['Crowd', 'Potential', 'Committed', 'Volunteer', 'Worker', 'Leader']),
  followUpType: z.enum(['General', 'Adhoc']).optional(),
  archive: z.enum(['Active', 'Relocated', 'Has a church', 'Wrong number', 'Unreachable', 'Not interested']).nullish(),
  branchId: z.string().min(1, "Branch is required").optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFirstTimerSchema = createInsertSchema(firstTimers, {
  email: z.string().email().optional().or(z.literal('')),
  mobilePhone: z.string().min(1, "Mobile phone is required"),
  gender: z.enum(['Male', 'Female']),
  basedInCity: z.enum(['Yes', 'No']),
  seeingAgain: z.enum(['Yes', 'No', 'Maybe']),
  howHeardAbout: z.enum(['Oikia member', 'Social media', 'Billboard/Lamp post']),
  enjoyedAboutService: z.array(z.enum(['Sermon', 'Prayer', 'Praise and worship', 'Ambience'])),
  branchId: z.string().min(1, "Branch is required").optional(),
}).omit({
  id: true,
  createdAt: true,
  convertedToMember: true,
  memberId: true,
});

export const insertAttendanceSchema = createInsertSchema(attendance, {
  status: z.enum(['Present', 'Absent']),
}).omit({
  id: true,
  createdAt: true,
});

export const insertCommunicationSchema = createInsertSchema(communications, {
  type: z.enum(['SMS', 'Email']),
  subject: z.string().optional(),
  message: z.string().min(1, "Message is required"),
  recipientCount: z.number().min(1, "At least one recipient required"),
  filters: z.string(),
  sentBy: z.string().min(1, "Sender is required"),
}).omit({
  id: true,
  createdAt: true,
});

export const insertFollowUpTaskSchema = createInsertSchema(followUpTasks, {
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assignedTo: z.string().min(1, "Assigned to is required"),
  status: z.enum(['Pending', 'In Progress', 'Completed', 'Cancelled']),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertClusterSchema = createInsertSchema(clusters, {
  name: z.string({ required_error: "Cluster name is required" }).min(1, "Cluster name is required"),
  branchId: z.string({ required_error: "Branch is required" }).min(1, "Branch is required"),
  leader: z.string().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertCellSchema = createInsertSchema(cells, {
  name: z.string({ required_error: "Cell name is required" }).min(1, "Cell name is required"),
  clusterId: z.string({ required_error: "Cluster is required" }).min(1, "Cluster is required"),
  leader: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCellAttendanceSchema = createInsertSchema(cellAttendance, {
  cellId: z.string().min(1, "Cell is required"),
  memberId: z.string().min(1, "Member is required"),
  meetingDate: z.string().min(1, "Meeting date is required"),
}).omit({
  id: true,
  createdAt: true,
});

export const insertBranchSchema = createInsertSchema(branches, {
  name: z.string().min(1, "Branch name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const outreach = pgTable("outreach", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  clusterId: varchar("cluster_id").references(() => clusters.id, { onDelete: "set null" }),
  address: text("address"),
  notes: text("notes"),
  branchId: varchar("branch_id").references(() => branches.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOutreachSchema = createInsertSchema(outreach, {
  name: z.string().min(1, "Name is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  clusterId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertUserRoleSchema = createInsertSchema(userRoles, {
  userId: z.string().min(1, "User is required"),
  role: z.enum(userRoleEnum),
  branchId: z.string().optional(),
  clusterId: z.string().optional(),
  cellId: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Least-privilege guard: every role except super_admin must be scoped down to
// where it actually operates, so a role can never be assigned with broader
// (or accidentally zero) reach than its name implies. group_admin additionally
// needs a cluster, and cell_leader additionally needs a cell.
function requireRoleScope(
  data: { role: string; branchId?: string | null; clusterId?: string | null; cellId?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.role === "super_admin") return;
  if (!data.branchId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["branchId"], message: "A branch is required for this role" });
  }
  if (data.role === "group_admin" && !data.clusterId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clusterId"], message: "Group Admin requires a cluster" });
  }
  if (data.role === "cell_leader" && !data.cellId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cellId"], message: "Cell Leader requires a cell" });
  }
}

export const roleAssignmentSchema = insertUserRoleSchema.superRefine(requireRoleScope);

export const updateUserRoleSchema = insertUserRoleSchema.partial().superRefine((data, ctx) => {
  if (!data.role) return; // not changing the role in this update — nothing to re-validate
  requireRoleScope(data as { role: string; branchId?: string | null; clusterId?: string | null; cellId?: string | null }, ctx);
});

export type Member = typeof members.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type FirstTimer = typeof firstTimers.$inferSelect;
export type InsertFirstTimer = z.infer<typeof insertFirstTimerSchema>;
export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Communication = typeof communications.$inferSelect;
export type InsertCommunication = z.infer<typeof insertCommunicationSchema>;
export type FollowUpTask = typeof followUpTasks.$inferSelect;
export type InsertFollowUpTask = z.infer<typeof insertFollowUpTaskSchema>;

export type MemberWithAttendanceStats = Member & {
  lastAttended: string | null;
  timesAttended: number;
  timeSinceAttended: number | null;
};

export type FollowUpTaskWithMember = FollowUpTask & {
  member: Member;
};

export type Cluster = typeof clusters.$inferSelect;
export type InsertCluster = z.infer<typeof insertClusterSchema>;
export type ClusterWithCells = Cluster & { cells: Cell[]; cellCount: number; branchName?: string };

export type Cell = typeof cells.$inferSelect;
export type InsertCell = z.infer<typeof insertCellSchema>;
export type CellAttendance = typeof cellAttendance.$inferSelect;
export type InsertCellAttendance = z.infer<typeof insertCellAttendanceSchema>;

export type CellWithMembers = Cell & {
  members: Member[];
  memberCount: number;
  clusterName?: string;
};

export type CellAttendanceWithMember = CellAttendance & {
  member: Member;
};

export type Outreach = typeof outreach.$inferSelect;
export type InsertOutreach = z.infer<typeof insertOutreachSchema>;
export type OutreachWithMemberStatus = Outreach & { isMember: boolean; clusterName?: string | null };

export type Branch = typeof branches.$inferSelect;
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRoleType = typeof userRoleEnum[number];
export type RolePermission = typeof rolePermissions.$inferSelect;

// User with role information
export type UserWithRole = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: UserRole | null;
  branch: Branch | null;
};

// Pagination types
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Slim member type for dropdowns and attendance (no expensive attendance subqueries)
export type MemberSlim = Pick<Member, 'id' | 'firstName' | 'lastName' | 'mobilePhone' | 'email' | 'status' | 'cluster' | 'cell'>;

// SMTP Settings - single global row
export const smtpSettings = pgTable("smtp_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull().default('smtp'), // 'smtp' | 'resend'
  host: text("host").notNull().default(''),
  port: integer("port").notNull().default(587),
  username: text("username").notNull().default(''),
  encryptedPassword: text("encrypted_password").notNull().default(''),
  fromEmail: text("from_email").notNull().default(''),
  fromName: text("from_name").notNull().default(''),
  security: text("security").notNull().default('starttls'), // 'starttls' | 'ssl' | 'none'
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSmtpSettingsSchema = createInsertSchema(smtpSettings, {
  provider: z.enum(['smtp', 'resend']).default('smtp'),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  username: z.string(),
  encryptedPassword: z.string(),
  fromEmail: z.string().email("Invalid from email"),
  fromName: z.string().min(1, "From name is required"),
  security: z.enum(['starttls', 'ssl', 'none']),
  enabled: z.boolean(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export type SmtpSettings = typeof smtpSettings.$inferSelect;
export type InsertSmtpSettings = z.infer<typeof insertSmtpSettingsSchema>;

// Email Templates
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // e.g. 'signup_confirmation'
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates, {
  name: z.string().min(1),
  subject: z.string().min(1, "Subject is required"),
  htmlContent: z.string().min(1, "HTML content is required"),
}).omit({ id: true, createdAt: true, updatedAt: true });

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
