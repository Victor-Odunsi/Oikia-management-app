import {
  members,
  firstTimers,
  attendance,
  communications,
  followUpTasks,
  clusters,
  cells,
  cellAttendance,
  branches,
  userRoles,
  rolePermissions,
  users,
  outreach,
  smtpSettings,
  emailTemplates,
  type Member,
  type InsertMember,
  type FirstTimer,
  type InsertFirstTimer,
  type Attendance,
  type InsertAttendance,
  type Communication,
  type InsertCommunication,
  type FollowUpTask,
  type InsertFollowUpTask,
  type MemberWithAttendanceStats,
  type FollowUpTaskWithMember,
  type Cluster,
  type InsertCluster,
  type ClusterWithCells,
  type Cell,
  type InsertCell,
  type CellAttendance,
  type InsertCellAttendance,
  type CellWithMembers,
  type CellAttendanceWithMember,
  type Branch,
  type InsertBranch,
  type UserRole,
  type InsertUserRole,
  type UserWithRole,
  type User,
  type Outreach,
  type InsertOutreach,
  type OutreachWithMemberStatus,
  type PaginatedResult,
  type MemberSlim,
  type SmtpSettings,
  type InsertSmtpSettings,
  type EmailTemplate,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, inArray, asc, gt, gte, lte, ilike, or, isNull } from "drizzle-orm";
import type { Scope } from "./authz/scope";

export interface IStorage {
  // Members
  getMembers(scope: Scope, filters?: { status?: string; statuses?: string[]; gender?: string; occupation?: string; cluster?: string; search?: string; page?: number; limit?: number; minAttended?: number; maxAttended?: number; lastAttendedWithin?: number; notAttendedSince?: number; archiveStatuses?: string[]; sortBy?: "firstName" | "lastName" | "joinDate" | "status" | "createdAt" | "updatedAt"; sortOrder?: "asc" | "desc"; joinDateFrom?: string; joinDateTo?: string }): Promise<PaginatedResult<MemberWithAttendanceStats>>;
  getMembersList(scope: Scope): Promise<MemberSlim[]>;
  getMemberById(scope: Scope, id: string): Promise<Member | undefined>;
  createMember(scope: Scope, member: InsertMember): Promise<Member>;
  createMembersBatch(rows: InsertMember[]): Promise<void>;
  updateMember(scope: Scope, id: string, member: Partial<InsertMember>): Promise<Member>;
  deleteMember(scope: Scope, id: string): Promise<void>;
  bulkDeleteMembers(scope: Scope, ids: string[]): Promise<void>;
  bulkUpdateMembers(scope: Scope, ids: string[], updates: Partial<InsertMember>): Promise<void>;
  getMemberIdsByFilters(scope: Scope, filters: { status?: string; statuses?: string[]; gender?: string; occupation?: string; cluster?: string; search?: string; minAttended?: number; maxAttended?: number; lastAttendedWithin?: number; notAttendedSince?: number; archiveStatuses?: string[] }): Promise<string[]>;
  findDuplicates(scope: Scope): Promise<{ reason: string; members: Member[] }[]>;
  mergeMembers(scope: Scope, primaryId: string, duplicateIds: string[]): Promise<Member>;

  // First Timers
  getFirstTimers(scope: Scope, params?: { page?: number; limit?: number; search?: string; seeingAgain?: string; dateFrom?: string; dateTo?: string; sortBy?: "firstName" | "lastName" | "createdAt" | "seeingAgain"; sortOrder?: "asc" | "desc" }): Promise<PaginatedResult<FirstTimer>>;
  getFirstTimerById(scope: Scope, id: string): Promise<FirstTimer | undefined>;
  createFirstTimer(scope: Scope, firstTimer: InsertFirstTimer): Promise<FirstTimer>;
  createFirstTimersBatch(rows: InsertFirstTimer[]): Promise<void>;
  updateFirstTimer(scope: Scope, id: string, data: Partial<InsertFirstTimer>): Promise<FirstTimer>;
  convertFirstTimerToMember(scope: Scope, id: string): Promise<Member>;

  // Attendance
  getAttendance(scope: Scope, filters: { memberId?: string; serviceDate?: string }): Promise<Attendance[]>;
  getAttendanceList(scope: Scope, filters: { memberId?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }): Promise<PaginatedResult<Attendance>>;
  getAttendanceByDate(scope: Scope, serviceDate: string): Promise<Record<string, string>>;
  toggleAttendance(scope: Scope, memberId: string, serviceDate: string, status: string): Promise<Attendance>;
  markAllPresentByStatus(scope: Scope, serviceDate: string, status: string): Promise<void>;
  batchToggleAttendance(entries: { memberId: string; serviceDate: string; status: string }[]): Promise<void>;

  // Stats
  getStats(): Promise<{
    totalMembers: number;
    totalFirstTimers: number;
    recentAttendance: number;
    newMembersThisMonth: number;
  }>;
  
  // Analytics
  getAttendanceTrends(days?: number): Promise<{ date: string; present: number; total: number }[]>;
  getMemberStatusDistribution(): Promise<{ status: string; count: number }[]>;
  getRecentActivity(): Promise<{
    recentMembers: Member[];
    recentFirstTimers: FirstTimer[];
  }>;
  
  // Communications
  sendBulkCommunication(communication: InsertCommunication): Promise<Communication>;
  getCommunications(): Promise<Communication[]>;
  
  // Follow-up Tasks
  getFollowUpTasks(scope: Scope, filters?: { assignedTo?: string; status?: string; memberId?: string; page?: number; limit?: number }): Promise<PaginatedResult<FollowUpTaskWithMember>>;
  getFollowUpTaskById(scope: Scope, id: string): Promise<FollowUpTaskWithMember | undefined>;
  createFollowUpTask(task: InsertFollowUpTask): Promise<FollowUpTask>;
  updateFollowUpTask(scope: Scope, id: string, task: Partial<InsertFollowUpTask>): Promise<FollowUpTask>;
  deleteFollowUpTask(scope: Scope, id: string): Promise<void>;
  completeFollowUpTask(scope: Scope, id: string): Promise<FollowUpTask>;

  // Clusters
  getClusters(scope: Scope, branchId?: string): Promise<ClusterWithCells[]>;
  getClusterById(scope: Scope, id: string): Promise<Cluster | undefined>;
  createCluster(cluster: InsertCluster): Promise<Cluster>;
  updateCluster(scope: Scope, id: string, cluster: Partial<InsertCluster>): Promise<Cluster>;
  deleteCluster(scope: Scope, id: string): Promise<void>;

  // Cells
  getCells(scope: Scope, clusterId?: string): Promise<CellWithMembers[]>;
  getCellById(scope: Scope, id: string): Promise<CellWithMembers | undefined>;
  createCell(cell: InsertCell): Promise<Cell>;
  updateCell(scope: Scope, id: string, cell: Partial<InsertCell>): Promise<Cell>;
  deleteCell(scope: Scope, id: string): Promise<void>;

  // Cell Attendance
  getCellAttendance(scope: Scope, cellId: string, meetingDate?: string): Promise<CellAttendanceWithMember[]>;
  getAllCellAttendance(scope: Scope): Promise<CellAttendance[]>;
  recordCellAttendance(scope: Scope, data: InsertCellAttendance): Promise<CellAttendance>;
  deleteCellAttendance(scope: Scope, id: string): Promise<void>;
  getCellMeetingDates(cellId: string): Promise<string[]>;
  
  // Branches
  getBranches(): Promise<Branch[]>;
  getBranchById(id: string): Promise<Branch | undefined>;
  createBranch(branch: InsertBranch): Promise<Branch>;
  updateBranch(id: string, branch: Partial<InsertBranch>): Promise<Branch>;
  deleteBranch(id: string): Promise<void>;
  
  // Users
  getUsers(): Promise<User[]>;
  
  // User Roles
  getAllUsers(): Promise<UserWithRole[]>;
  getAllUserRoles(): Promise<UserRole[]>;
  getUserWithRole(userId: string): Promise<UserWithRole | undefined>;
  getUserRole(userId: string): Promise<UserRole | undefined>;
  assignUserRole(data: InsertUserRole): Promise<UserRole>;
  updateUserRole(id: string, data: Partial<InsertUserRole>): Promise<UserRole>;
  deleteUserRole(id: string): Promise<void>;
  
  // Outreach
  getOutreach(scope: Scope, params?: { branchId?: string; page?: number; limit?: number }): Promise<PaginatedResult<OutreachWithMemberStatus>>;
  getOutreachById(scope: Scope, id: string): Promise<Outreach | undefined>;
  createOutreach(scope: Scope, data: InsertOutreach): Promise<Outreach>;
  updateOutreach(scope: Scope, id: string, data: Partial<InsertOutreach>): Promise<Outreach>;
  deleteOutreach(scope: Scope, id: string): Promise<void>;

  // User signup + account management
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createSignupUser(data: { firstName: string; lastName: string; gender: string; address: string; phoneNumber: string; email: string; branchId: string; passwordHash: string }): Promise<User>;
  incrementLoginCount(userId: string): Promise<void>;
  completeOnboarding(userId: string): Promise<void>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  clearPasswordResetToken(userId: string): Promise<void>;

  // Role Permissions
  getRolePermissions(): Promise<Record<string, string[]>>;
  setRolePermissions(data: Record<string, string[]>): Promise<void>;

  // SMTP Settings
  getSmtpSettings(): Promise<SmtpSettings | undefined>;
  upsertSmtpSettings(data: InsertSmtpSettings): Promise<SmtpSettings>;

  // Email Templates
  getEmailTemplate(name: string): Promise<EmailTemplate | undefined>;
  upsertEmailTemplate(name: string, data: { subject: string; htmlContent: string }): Promise<EmailTemplate>;

  // Reports
  getExecutiveSummary(): Promise<{
    membersByStatus: { status: string; count: number }[];
    memberGrowth: { month: string; count: number }[];
    attendanceTrend: { date: string; present: number; total: number }[];
    firstTimerStats: { total: number; converted: number; pending: number };
    followUpStats: { total: number; completed: number; pending: number };
    occupationDistribution: { occupation: string; count: number }[];
    genderDistribution: { gender: string; count: number }[];
    clusterAttendance: { clusterName: string; totalAttendance: number }[];
  }>;
  getFirstTimerAnalysis(): Promise<{
    conversionStats: {
      convertedThisQuarter: number;
      totalThisQuarter: number;
      stillAttending: number;
      stillAttendingPct: number;
      avgServicesAttended: number;
      droppedOff: number;
      droppedOffPct: number;
    };
    attendanceFrequency: { bucket: string; label: string; count: number }[];
    retentionBySeeingAgain: { intent: string; retained: number; droppedOff: number }[];
    howHeardAbout: { source: string; count: number }[];
    enjoyedAboutService: { aspect: string; count: number }[];
  }>;
  getCellAttendanceAnalysis(): Promise<{
    attendanceTrend: { date: string; count: number }[];
    topCells: { cellName: string; clusterName: string; totalAttendance: number; avgPerMeeting: number }[];
    clusterComparison: { clusterName: string; totalAttendance: number; cellCount: number; avgPerMeeting: number }[];
    recentMeetings: { cellName: string; clusterName: string; meetingDate: string; attendees: number }[];
  }>;
}

const ALL_PERMISSIONS = [
  "members.view", "members.create", "members.edit", "members.delete", "members.import",
  "first_timers.view", "first_timers.create", "first_timers.convert",
  "attendance.view", "attendance.edit",
  "cells.view", "cells.manage",
  "communications.send",
  "follow_up_tasks.view", "follow_up_tasks.manage",
  "outreach.view", "outreach.manage",
  "branches.manage", "users.manage", "roles.manage",
];

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [...ALL_PERMISSIONS],
  branch_admin: ALL_PERMISSIONS.filter(p => p !== "roles.manage"),
  group_admin: [
    "members.view", "first_timers.view", "first_timers.create",
    "attendance.view", "attendance.edit", "cells.view", "cells.manage",
    "follow_up_tasks.view", "follow_up_tasks.manage",
    "outreach.view", "outreach.manage",
  ],
  cell_leader: ["members.view", "attendance.view", "cells.view", "follow_up_tasks.view", "outreach.view"],
  branch_rep: [
    "members.view", "members.create", "members.edit",
    "first_timers.view", "first_timers.create", "first_timers.convert",
    "attendance.view", "attendance.edit",
    "outreach.view", "outreach.manage",
  ],
};

export class DatabaseStorage implements IStorage {
  // --- Branch/cluster/cell scope helpers -----------------------------------
  // Every non-super_admin role is confined to a branch (and, for
  // group_admin/cell_leader, further to a cluster/cell). These helpers turn
  // a Scope into the extra WHERE condition each query needs — undefined
  // means "no extra restriction" (super_admin only).

  private branchCondition(table: { branchId: any }, scope: Scope) {
    return scope.role === "super_admin" ? undefined : eq(table.branchId, scope.branchId);
  }

  // Tables that only reference a member (attendance, follow_up_tasks,
  // cell_attendance) don't have their own branchId — scope them via a
  // subquery of member ids belonging to the scope's branch. null = unrestricted.
  private memberScopeSubquery(scope: Scope) {
    if (scope.role === "super_admin") return null;
    return db.select({ id: members.id }).from(members).where(eq(members.branchId, scope.branchId));
  }

  // Condition on the clusters table: branch-scoped for branch_admin/branch_rep,
  // narrowed to a single cluster for group_admin. undefined = unrestricted.
  private clusterScopeCondition(scope: Scope) {
    if (scope.role === "super_admin") return undefined;
    if (scope.role === "group_admin" && scope.clusterId) return eq(clusters.id, scope.clusterId);
    return eq(clusters.branchId, scope.branchId);
  }

  // For create-path writes: a scoped (non-super_admin) caller can never
  // choose a different branch than their own, regardless of what the request
  // body says.
  private pinnedBranchId(scope: Scope, requestedBranchId: string | null | undefined): string | null | undefined {
    return scope.role === "super_admin" ? requestedBranchId : scope.branchId;
  }

  // Condition on the cells table (joined with clusters) — narrowed to a
  // single cell for cell_leader, a single cluster for group_admin, or the
  // whole branch (via the joined clusters.branchId) otherwise.
  private cellScopeCondition(scope: Scope) {
    if (scope.role === "super_admin") return undefined;
    if (scope.role === "cell_leader") return scope.cellId ? eq(cells.id, scope.cellId) : sql`false`;
    if (scope.role === "group_admin" && scope.clusterId) return eq(cells.clusterId, scope.clusterId);
    return eq(clusters.branchId, scope.branchId);
  }

  private async isCellInScope(cellId: string, scope: Scope): Promise<boolean> {
    if (scope.role === "super_admin") return true;
    const cond = this.cellScopeCondition(scope);
    const [row] = await db.select({ id: cells.id }).from(cells)
      .leftJoin(clusters, eq(cells.clusterId, clusters.id))
      .where(cond ? and(eq(cells.id, cellId), cond) : eq(cells.id, cellId));
    return !!row;
  }

  // Subquery of cluster ids the scope can manage — for cell mutations that
  // don't join clusters directly. null = unrestricted.
  private allowedClusterIdsSubquery(scope: Scope) {
    if (scope.role === "super_admin") return null;
    if (scope.role === "group_admin" && scope.clusterId) {
      return db.select({ id: clusters.id }).from(clusters).where(eq(clusters.id, scope.clusterId));
    }
    return db.select({ id: clusters.id }).from(clusters).where(eq(clusters.branchId, scope.branchId));
  }

  async getMembers(scope: Scope, filters?: {
    status?: string;
    statuses?: string[];
    gender?: string;
    occupation?: string;
    cluster?: string;
    search?: string;
    page?: number;
    limit?: number;
    minAttended?: number;
    maxAttended?: number;
    lastAttendedWithin?: number;
    notAttendedSince?: number;
    archiveStatuses?: string[];
    sortBy?: "firstName" | "lastName" | "joinDate" | "status" | "createdAt" | "updatedAt";
    sortOrder?: "asc" | "desc";
    joinDateFrom?: string;
    joinDateTo?: string;
  }): Promise<PaginatedResult<MemberWithAttendanceStats>> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;

    const conditions = [];
    const scopeCond = this.branchCondition(members, scope);
    if (scopeCond) conditions.push(scopeCond);
    if (filters?.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(members.status, filters.statuses));
    } else if (filters?.status) {
      conditions.push(eq(members.status, filters.status));
    }
    if (filters?.gender) {
      conditions.push(eq(members.gender, filters.gender));
    }
    if (filters?.occupation) {
      conditions.push(eq(members.occupation, filters.occupation));
    }
    if (filters?.cluster) {
      conditions.push(eq(members.cluster, filters.cluster));
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      conditions.push(sql`(${members.firstName} ILIKE ${term} OR ${members.lastName} ILIKE ${term} OR ${members.mobilePhone} ILIKE ${term})`);
    }
    if (filters?.joinDateFrom) {
      conditions.push(gte(members.joinDate, filters.joinDateFrom));
    }
    if (filters?.joinDateTo) {
      conditions.push(lte(members.joinDate, filters.joinDateTo));
    }
    if (filters?.archiveStatuses && filters.archiveStatuses.length > 0) {
      const hasNull = filters.archiveStatuses.includes('__null__');
      const realValues = filters.archiveStatuses.filter(v => v !== '__null__');
      if (hasNull && realValues.length > 0) {
        conditions.push(or(isNull(members.archive), inArray(members.archive, realValues))!);
      } else if (hasNull) {
        conditions.push(isNull(members.archive));
      } else {
        conditions.push(inArray(members.archive, realValues));
      }
    }
    if (filters?.minAttended !== undefined) {
      conditions.push(sql`(
        SELECT COUNT(*) FROM attendance WHERE member_id = ${members.id} AND status = 'Present'
      ) >= ${filters.minAttended}`);
    }
    if (filters?.maxAttended !== undefined) {
      conditions.push(sql`(
        SELECT COUNT(*) FROM attendance WHERE member_id = ${members.id} AND status = 'Present'
      ) <= ${filters.maxAttended}`);
    }
    if (filters?.lastAttendedWithin !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filters.lastAttendedWithin);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      conditions.push(sql`(
        SELECT MAX(service_date) FROM attendance WHERE member_id = ${members.id} AND status = 'Present'
      ) >= ${cutoffStr}::date`);
    }
    if (filters?.notAttendedSince !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filters.notAttendedSince);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      conditions.push(sql`
        COALESCE((SELECT MAX(service_date) FROM attendance WHERE member_id = ${members.id} AND status = 'Present'), '1900-01-01'::date) < ${cutoffStr}::date
      `);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(members)
      .where(whereClause);

    // Allowlisted sort columns only — callers can never sort by an arbitrary
    // DB column. Defaults to the pre-existing firstName/lastName ordering.
    const SORT_COLUMNS = {
      firstName: members.firstName,
      lastName: members.lastName,
      joinDate: members.joinDate,
      status: members.status,
      createdAt: members.createdAt,
      updatedAt: members.updatedAt,
    } as const;
    const direction = filters?.sortOrder === "asc" ? asc : desc;
    const orderByClause = filters?.sortBy
      ? [direction(SORT_COLUMNS[filters.sortBy]), asc(members.lastName)]
      : [asc(members.firstName), asc(members.lastName)];

    let query = db
      .select({
        id: members.id,
        firstName: members.firstName,
        lastName: members.lastName,
        gender: members.gender,
        mobilePhone: members.mobilePhone,
        email: members.email,
        address: members.address,
        occupation: members.occupation,
        joinDate: members.joinDate,
        cluster: members.cluster,
        followUpWorker: members.followUpWorker,
        cell: members.cell,
        status: members.status,
        dateOfBirth: members.dateOfBirth,
        followUpType: members.followUpType,
        archive: members.archive,
        summaryNotes: members.summaryNotes,
        branchId: members.branchId,
        createdAt: members.createdAt,
        updatedAt: members.updatedAt,
      })
      .from(members)
      .orderBy(...orderByClause)
      .limit(limit)
      .offset(offset);

    if (whereClause) {
      query = query.where(whereClause) as any;
    }

    const rows = await query;

    if (rows.length === 0) {
      return { data: [], total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    const memberIds = rows.map(r => r.id);

    // Fetch Sunday service attendance stats for this page of members
    const serviceStats = await db
      .select({
        memberId: attendance.memberId,
        lastDate: sql<string>`MAX(${attendance.serviceDate})::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(attendance)
      .where(and(inArray(attendance.memberId, memberIds), eq(attendance.status, 'Present')))
      .groupBy(attendance.memberId);

    const serviceMap = new Map(serviceStats.map(s => [s.memberId, s]));

    const data: MemberWithAttendanceStats[] = rows.map(member => {
      const svc = serviceMap.get(member.id);
      const lastAttended = svc?.lastDate ?? null;
      const timesAttended = svc?.count ?? 0;
      const timeSinceAttended = lastAttended
        ? Math.floor((Date.now() - new Date(lastAttended + 'T12:00:00').getTime()) / 86400000)
        : null;
      return { ...member, lastAttended, timesAttended, timeSinceAttended };
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getMembersList(scope: Scope): Promise<MemberSlim[]> {
    const cond = this.branchCondition(members, scope);
    const query = db
      .select({
        id: members.id,
        firstName: members.firstName,
        lastName: members.lastName,
        mobilePhone: members.mobilePhone,
        email: members.email,
        status: members.status,
        cluster: members.cluster,
        cell: members.cell,
      })
      .from(members)
      .orderBy(asc(members.firstName), asc(members.lastName));
    return cond ? await query.where(cond) : await query;
  }

  async getMemberById(scope: Scope, id: string): Promise<Member | undefined> {
    const cond = this.branchCondition(members, scope);
    const [member] = await db.select().from(members).where(cond ? and(eq(members.id, id), cond) : eq(members.id, id));
    return member || undefined;
  }

  async createMember(scope: Scope, insertMember: InsertMember): Promise<Member> {
    const [member] = await db
      .insert(members)
      .values({ ...insertMember, branchId: this.pinnedBranchId(scope, insertMember.branchId) })
      .returning();
    return member;
  }

  async createMembersBatch(rows: InsertMember[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(members).values(rows);
  }

  async updateMember(scope: Scope, id: string, updateData: Partial<InsertMember>): Promise<Member> {
    const cond = this.branchCondition(members, scope);
    const [member] = await db
      .update(members)
      .set({ ...updateData, updatedAt: new Date() })
      .where(cond ? and(eq(members.id, id), cond) : eq(members.id, id))
      .returning();
    if (!member) throw new Error("Member not found");
    return member;
  }

  async deleteMember(scope: Scope, id: string): Promise<void> {
    const cond = this.branchCondition(members, scope);
    const result = await db
      .delete(members)
      .where(cond ? and(eq(members.id, id), cond) : eq(members.id, id))
      .returning({ id: members.id });
    if (result.length === 0) throw new Error("Member not found");
  }

  async bulkDeleteMembers(scope: Scope, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const cond = this.branchCondition(members, scope);
    await db.delete(members).where(cond ? and(inArray(members.id, ids), cond) : inArray(members.id, ids));
  }

  async bulkUpdateMembers(scope: Scope, ids: string[], updates: Partial<InsertMember>): Promise<void> {
    if (ids.length === 0) return;
    const cond = this.branchCondition(members, scope);
    await db
      .update(members)
      .set({ ...updates, updatedAt: new Date() })
      .where(cond ? and(inArray(members.id, ids), cond) : inArray(members.id, ids));
  }

  async getMemberIdsByFilters(scope: Scope, filters: { status?: string; statuses?: string[]; gender?: string; occupation?: string; cluster?: string; search?: string; minAttended?: number; maxAttended?: number; lastAttendedWithin?: number; notAttendedSince?: number; archiveStatuses?: string[] }): Promise<string[]> {
    const conditions = [];
    const scopeCond = this.branchCondition(members, scope);
    if (scopeCond) conditions.push(scopeCond);
    if (filters.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(members.status, filters.statuses));
    } else if (filters.status) {
      conditions.push(eq(members.status, filters.status));
    }
    if (filters.gender) conditions.push(eq(members.gender, filters.gender));
    if (filters.occupation) conditions.push(eq(members.occupation, filters.occupation));
    if (filters.cluster) conditions.push(eq(members.cluster, filters.cluster));
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(sql`(${members.firstName} ILIKE ${term} OR ${members.lastName} ILIKE ${term} OR ${members.mobilePhone} ILIKE ${term})`);
    }
    if (filters.archiveStatuses && filters.archiveStatuses.length > 0) {
      const hasNull = filters.archiveStatuses.includes('__null__');
      const realValues = filters.archiveStatuses.filter(v => v !== '__null__');
      if (hasNull && realValues.length > 0) {
        conditions.push(or(isNull(members.archive), inArray(members.archive, realValues))!);
      } else if (hasNull) {
        conditions.push(isNull(members.archive));
      } else {
        conditions.push(inArray(members.archive, realValues));
      }
    }
    if (filters.minAttended !== undefined) {
      conditions.push(sql`(
        SELECT COUNT(*) FROM attendance WHERE member_id = ${members.id} AND status = 'Present'
      ) >= ${filters.minAttended}`);
    }
    if (filters.maxAttended !== undefined) {
      conditions.push(sql`(
        SELECT COUNT(*) FROM attendance WHERE member_id = ${members.id} AND status = 'Present'
      ) <= ${filters.maxAttended}`);
    }
    if (filters.lastAttendedWithin !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filters.lastAttendedWithin);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      conditions.push(sql`(
        SELECT MAX(service_date) FROM attendance WHERE member_id = ${members.id} AND status = 'Present'
      ) >= ${cutoffStr}::date`);
    }
    if (filters.notAttendedSince !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filters.notAttendedSince);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      conditions.push(sql`
        COALESCE((SELECT MAX(service_date) FROM attendance WHERE member_id = ${members.id} AND status = 'Present'), '1900-01-01'::date) < ${cutoffStr}::date
      `);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select({ id: members.id }).from(members).where(whereClause);
    return rows.map(r => r.id);
  }

  async findDuplicates(scope: Scope): Promise<{ reason: string; members: Member[] }[]> {
    const cond = this.branchCondition(members, scope);
    const allMembers = cond ? await db.select().from(members).where(cond) : await db.select().from(members);
    const groups: { reason: string; members: Member[] }[] = [];
    const seenKeys = new Set<string>();

    // Normalize phone to last 10 digits so "08012345678" and "+2348012345678" match
    const normalizePhone = (phone: string) => {
      const d = phone.replace(/\D/g, "");
      return d.length >= 10 ? d.slice(-10) : d;
    };

    const bucket: Record<string, Member[]> = {};

    // Bucket by phone
    for (const m of allMembers) {
      const k = "phone:" + normalizePhone(m.mobilePhone);
      if (!bucket[k]) bucket[k] = [];
      bucket[k].push(m);
    }

    // Bucket by name (first + last, case-insensitive)
    for (const m of allMembers) {
      const k = "name:" + m.firstName.trim().toLowerCase() + "|" + m.lastName.trim().toLowerCase();
      if (!bucket[k]) bucket[k] = [];
      bucket[k].push(m);
    }

    // Bucket by email (skip empty)
    for (const m of allMembers) {
      const email = (m.email ?? "").trim().toLowerCase();
      if (!email) continue;
      const k = "email:" + email;
      if (!bucket[k]) bucket[k] = [];
      bucket[k].push(m);
    }

    for (const key of Object.keys(bucket)) {
      const grp = bucket[key];
      if (grp.length < 2) continue;
      const groupKey = grp.map(m => m.id).sort().join(",");
      if (seenKeys.has(groupKey)) continue;
      seenKeys.add(groupKey);
      const [type, value] = key.split(":");
      const reason =
        type === "phone" ? "Same phone number" :
        type === "name"  ? `Same name (${grp[0].firstName} ${grp[0].lastName})` :
                           `Same email (${value})`;
      groups.push({ reason, members: grp });
    }

    return groups;
  }

  async mergeMembers(scope: Scope, primaryId: string, duplicateIds: string[]): Promise<Member> {
    // Wrapped in a transaction: a crash partway through must not leave
    // duplicate records deleted with no audit trail, or reassigned but
    // un-merged — everything below commits together or not at all.
    return await db.transaction(async (tx) => {
      const cond = this.branchCondition(members, scope);

      const [primary] = await tx.select().from(members)
        .where(cond ? and(eq(members.id, primaryId), cond) : eq(members.id, primaryId));
      if (!primary) throw new Error("Primary member not found");

      // Out-of-scope duplicateIds are silently dropped, not merged — no
      // cross-branch merge is possible even if one is requested.
      const duplicates = await tx.select().from(members)
        .where(cond ? and(inArray(members.id, duplicateIds), cond) : inArray(members.id, duplicateIds));
      const inScopeDupIds = new Set(duplicates.map(d => d.id));

      // Fill empty fields on primary from duplicates (first non-empty value wins)
      const mergeableFields: (keyof Member)[] = [
        "email", "address", "dateOfBirth", "followUpWorker", "cell",
        "followUpType", "archive", "branchId",
      ];
      const updates: Partial<InsertMember> = {};
      for (const field of mergeableFields) {
        if (!primary[field]) {
          for (const dup of duplicates) {
            if (dup[field]) {
              (updates as any)[field] = dup[field];
              break;
            }
          }
        }
      }

      // Append merge audit note
      const mergeNote = `Merged from: ${duplicates.map(d => `${d.firstName} ${d.lastName}`).join(", ")} on ${new Date().toLocaleDateString()}`;
      updates.summaryNotes = [primary.summaryNotes, mergeNote].filter(Boolean).join("\n");

      // Re-assign related records for each in-scope duplicate
      for (const dupId of duplicateIds) {
        if (!inScopeDupIds.has(dupId)) continue;

        // Attendance: avoid date conflicts
        const primaryAttendance = await tx.select({ serviceDate: attendance.serviceDate, status: attendance.status })
          .from(attendance).where(eq(attendance.memberId, primaryId));
        const primaryDateSet = new Set(primaryAttendance.map(a => a.serviceDate));

        const dupAttendance = await tx.select().from(attendance).where(eq(attendance.memberId, dupId));
        for (const a of dupAttendance) {
          if (primaryDateSet.has(a.serviceDate)) {
            await tx.delete(attendance).where(eq(attendance.id, a.id));
          } else {
            await tx.update(attendance).set({ memberId: primaryId }).where(eq(attendance.id, a.id));
            primaryDateSet.add(a.serviceDate);
          }
        }

        // Follow-up tasks
        await tx.update(followUpTasks).set({ memberId: primaryId }).where(eq(followUpTasks.memberId, dupId));

        // Cell attendance: avoid same-date conflicts
        const primaryCellAtt = await tx.select({ meetingDate: cellAttendance.meetingDate, cellId: cellAttendance.cellId })
          .from(cellAttendance).where(eq(cellAttendance.memberId, primaryId));
        const primaryCellDateSet = new Set(primaryCellAtt.map(a => `${a.cellId}:${a.meetingDate}`));

        const dupCellAtt = await tx.select().from(cellAttendance).where(eq(cellAttendance.memberId, dupId));
        for (const a of dupCellAtt) {
          const key = `${a.cellId}:${a.meetingDate}`;
          if (primaryCellDateSet.has(key)) {
            await tx.delete(cellAttendance).where(eq(cellAttendance.id, a.id));
          } else {
            await tx.update(cellAttendance).set({ memberId: primaryId }).where(eq(cellAttendance.id, a.id));
            primaryCellDateSet.add(key);
          }
        }

        await tx.delete(members).where(eq(members.id, dupId));
      }

      const [updatedPrimary] = await tx.update(members)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(members.id, primaryId))
        .returning();
      return updatedPrimary;
    });
  }

  async getFirstTimers(scope: Scope, params?: {
    page?: number;
    limit?: number;
    search?: string;
    seeingAgain?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: "firstName" | "lastName" | "createdAt" | "seeingAgain";
    sortOrder?: "asc" | "desc";
  }): Promise<PaginatedResult<FirstTimer>> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const offset = (page - 1) * limit;

    const conditions = [];
    const scopeCond = this.branchCondition(firstTimers, scope);
    if (scopeCond) conditions.push(scopeCond);
    if (params?.search) {
      const term = `%${params.search}%`;
      conditions.push(
        or(
          ilike(firstTimers.firstName, term),
          ilike(firstTimers.lastName, term),
          ilike(firstTimers.mobilePhone, term)
        )
      );
    }
    if (params?.seeingAgain) {
      conditions.push(eq(firstTimers.seeingAgain, params.seeingAgain));
    }
    if (params?.dateFrom) {
      conditions.push(gte(firstTimers.createdAt, new Date(params.dateFrom)));
    }
    if (params?.dateTo) {
      const to = new Date(params.dateTo);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(firstTimers.createdAt, to));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(firstTimers)
      .where(where);

    // Allowlisted sort columns only — callers can never sort by an arbitrary
    // DB column. Defaults to the pre-existing createdAt-descending ordering.
    const SORT_COLUMNS = {
      firstName: firstTimers.firstName,
      lastName: firstTimers.lastName,
      createdAt: firstTimers.createdAt,
      seeingAgain: firstTimers.seeingAgain,
    } as const;
    const direction = params?.sortOrder === "asc" ? asc : desc;
    const orderByClause = params?.sortBy ? direction(SORT_COLUMNS[params.sortBy]) : desc(firstTimers.createdAt);

    const data = await db.select().from(firstTimers)
      .where(where)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getFirstTimerById(scope: Scope, id: string): Promise<FirstTimer | undefined> {
    const cond = this.branchCondition(firstTimers, scope);
    const [firstTimer] = await db.select().from(firstTimers)
      .where(cond ? and(eq(firstTimers.id, id), cond) : eq(firstTimers.id, id));
    return firstTimer || undefined;
  }

  async createFirstTimer(scope: Scope, insertFirstTimer: InsertFirstTimer): Promise<FirstTimer> {
    const [firstTimer] = await db
      .insert(firstTimers)
      .values({ ...insertFirstTimer, branchId: this.pinnedBranchId(scope, insertFirstTimer.branchId) })
      .returning();
    return firstTimer;
  }

  async createFirstTimersBatch(rows: InsertFirstTimer[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(firstTimers).values(rows);
  }

  async updateFirstTimer(scope: Scope, id: string, data: Partial<InsertFirstTimer>): Promise<FirstTimer> {
    const cond = this.branchCondition(firstTimers, scope);
    const [updated] = await db
      .update(firstTimers)
      .set(data)
      .where(cond ? and(eq(firstTimers.id, id), cond) : eq(firstTimers.id, id))
      .returning();
    if (!updated) throw new Error("First timer not found");
    return updated;
  }

  async convertFirstTimerToMember(scope: Scope, id: string): Promise<Member> {
    // Wrapped in a transaction: creating the member and marking the
    // first-timer converted must succeed or fail together, or a crash
    // between the two leaves the first-timer stuck unconverted and a retry
    // creates a second, unlinked duplicate member.
    return await db.transaction(async (tx) => {
      const cond = this.branchCondition(firstTimers, scope);
      const [firstTimer] = await tx.select().from(firstTimers)
        .where(cond ? and(eq(firstTimers.id, id), cond) : eq(firstTimers.id, id));
      if (!firstTimer) {
        throw new Error("First timer not found");
      }

      if (firstTimer.convertedToMember && firstTimer.memberId) {
        throw new Error("First timer already converted");
      }

      // Build summary notes from all first-timer data
      const enjoyedServices = firstTimer.enjoyedAboutService?.join(", ") || "N/A";
      const summaryParts = [
        `Converted from first timer on ${new Date().toLocaleDateString()}.`,
        `Based in city: ${firstTimer.basedInCity}.`,
        `Seeing again: ${firstTimer.seeingAgain}.`,
        `Enjoyed: ${enjoyedServices}.`,
        `Heard about us via: ${firstTimer.howHeardAbout}.`,
        `Invited by: ${firstTimer.whoInvited || "N/A"}.`,
      ];

      if (firstTimer.feedback) {
        summaryParts.push(`Feedback: ${firstTimer.feedback}`);
      }

      const [newMember] = await tx.insert(members).values({
        firstName: firstTimer.firstName,
        lastName: firstTimer.lastName,
        gender: firstTimer.gender as "Male" | "Female",
        mobilePhone: firstTimer.mobilePhone,
        email: firstTimer.email || "",
        address: firstTimer.address || "",
        occupation: "Workers",
        joinDate: new Date().toISOString().split("T")[0],
        cluster: firstTimer.closestAxis,
        followUpWorker: "",
        cell: "",
        status: "Crowd",
        dateOfBirth: firstTimer.dateOfBirth || "",
        followUpType: "General",
        archive: undefined,
        summaryNotes: summaryParts.join(" "),
        branchId: this.pinnedBranchId(scope, firstTimer.branchId),
      }).returning();

      await tx
        .update(firstTimers)
        .set({
          convertedToMember: new Date(),
          memberId: newMember.id,
        })
        .where(eq(firstTimers.id, id));

      return newMember;
    });
  }

  async getAttendance(scope: Scope, filters: { memberId?: string; serviceDate?: string }): Promise<Attendance[]> {
    const conditions = [];
    if (filters.memberId) {
      conditions.push(eq(attendance.memberId, filters.memberId));
    }
    if (filters.serviceDate) {
      conditions.push(eq(attendance.serviceDate, filters.serviceDate));
    }
    const memberScope = this.memberScopeSubquery(scope);
    if (memberScope) conditions.push(inArray(attendance.memberId, memberScope));

    const query = db.select().from(attendance).orderBy(desc(attendance.serviceDate));
    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  }

  // Paginated attendance listing for the /api/v1 surface. Kept separate from
  // getAttendance() above (which the legacy /api/reporting/attendance route
  // returns verbatim as a bare array) so that response shape never changes.
  async getAttendanceList(scope: Scope, filters: {
    memberId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<Attendance>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filters.memberId) conditions.push(eq(attendance.memberId, filters.memberId));
    if (filters.status) conditions.push(eq(attendance.status, filters.status));
    if (filters.dateFrom) conditions.push(gte(attendance.serviceDate, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(attendance.serviceDate, filters.dateTo));
    const memberScope = this.memberScopeSubquery(scope);
    if (memberScope) conditions.push(inArray(attendance.memberId, memberScope));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(attendance)
      .where(whereClause);

    let query = db.select().from(attendance).orderBy(desc(attendance.serviceDate)).limit(limit).offset(offset);
    if (whereClause) {
      query = query.where(whereClause) as any;
    }
    const data = await query;

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getAttendanceByDate(scope: Scope, serviceDate: string): Promise<Record<string, string>> {
    const memberScope = this.memberScopeSubquery(scope);
    const cond = memberScope
      ? and(eq(attendance.serviceDate, serviceDate), inArray(attendance.memberId, memberScope))
      : eq(attendance.serviceDate, serviceDate);
    const records = await db
      .select()
      .from(attendance)
      .where(cond);

    const result: Record<string, string> = {};
    for (const record of records) {
      result[record.memberId] = record.status;
    }
    return result;
  }

  async toggleAttendance(
    scope: Scope,
    memberId: string,
    serviceDate: string,
    status: string
  ): Promise<Attendance> {
    if (scope.role !== "super_admin") {
      const [member] = await db.select({ branchId: members.branchId }).from(members).where(eq(members.id, memberId));
      if (!member || member.branchId !== scope.branchId) {
        throw new Error("Member not found");
      }
    }

    const existing = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.memberId, memberId), eq(attendance.serviceDate, serviceDate)));

    if (existing.length > 0) {
      const [updated] = await db
        .update(attendance)
        .set({ status })
        .where(eq(attendance.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(attendance)
        .values({ memberId, serviceDate, status })
        .returning();
      return created;
    }
  }

  async markAllPresentByStatus(scope: Scope, serviceDate: string, status: string): Promise<void> {
    const scopeCond = this.branchCondition(members, scope);
    const membersList = await db
      .select({ id: members.id })
      .from(members)
      .where(scopeCond ? and(eq(members.status, status), scopeCond) : eq(members.status, status));

    if (membersList.length === 0) return;

    const memberIds = membersList.map(m => m.id);

    // Batch-fetch existing attendance records for this date
    const existing = await db
      .select({ id: attendance.id, memberId: attendance.memberId })
      .from(attendance)
      .where(and(inArray(attendance.memberId, memberIds), eq(attendance.serviceDate, serviceDate)));

    const existingMemberIds = new Set(existing.map(a => a.memberId));
    const existingIds = existing.map(a => a.id);

    // Batch update existing records
    if (existingIds.length > 0) {
      await db.update(attendance).set({ status: "Present" }).where(inArray(attendance.id, existingIds));
    }

    // Batch insert new records
    const newMemberIds = memberIds.filter(id => !existingMemberIds.has(id));
    if (newMemberIds.length > 0) {
      await db.insert(attendance).values(
        newMemberIds.map(memberId => ({ memberId, serviceDate, status: "Present" }))
      );
    }
  }

  async batchToggleAttendance(entries: { memberId: string; serviceDate: string; status: string }[]): Promise<void> {
    if (entries.length === 0) return;

    // De-dupe within the batch on (memberId, serviceDate) — last write wins,
    // matching sequential toggleAttendance semantics.
    const dedupMap = new Map<string, { memberId: string; serviceDate: string; status: string }>();
    for (const e of entries) dedupMap.set(`${e.memberId}:${e.serviceDate}`, e);
    const deduped = Array.from(dedupMap.values());

    const memberIds = Array.from(new Set(deduped.map(e => e.memberId)));
    const existing = await db
      .select({ id: attendance.id, memberId: attendance.memberId, serviceDate: attendance.serviceDate })
      .from(attendance)
      .where(inArray(attendance.memberId, memberIds));
    const existingIdByKey = new Map(existing.map(a => [`${a.memberId}:${a.serviceDate}`, a.id]));

    const toInsert: { memberId: string; serviceDate: string; status: string }[] = [];
    const updateIdsByStatus = new Map<string, string[]>();
    for (const e of deduped) {
      const existingId = existingIdByKey.get(`${e.memberId}:${e.serviceDate}`);
      if (existingId) {
        if (!updateIdsByStatus.has(e.status)) updateIdsByStatus.set(e.status, []);
        updateIdsByStatus.get(e.status)!.push(existingId);
      } else {
        toInsert.push(e);
      }
    }

    // One batched UPDATE per distinct status value, one batched INSERT for the rest.
    for (const [status, ids] of Array.from(updateIdsByStatus.entries())) {
      await db.update(attendance).set({ status }).where(inArray(attendance.id, ids));
    }
    if (toInsert.length > 0) {
      await db.insert(attendance).values(toInsert);
    }
  }

  async getStats(): Promise<{
    totalMembers: number;
    totalFirstTimers: number;
    recentAttendance: number;
    newMembersThisMonth: number;
  }> {
    const [totalMembers] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(members);

    const [totalFirstTimers] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(firstTimers)
      .where(sql`${firstTimers.convertedToMember} IS NULL`);

    const today = new Date();
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - today.getDay());
    const lastSundayStr = lastSunday.toISOString().split("T")[0];

    const [recentAttendance] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(attendance)
      .where(
        and(eq(attendance.serviceDate, lastSundayStr), eq(attendance.status, "Present"))
      );

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .split("T")[0];

    const [newMembers] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(members)
      .where(sql`${members.joinDate} >= ${firstDayOfMonth}`);

    return {
      totalMembers: totalMembers.count,
      totalFirstTimers: totalFirstTimers.count,
      recentAttendance: recentAttendance.count,
      newMembersThisMonth: newMembers.count,
    };
  }

  async getAttendanceTrends(days: number = 30): Promise<{ date: string; present: number; total: number }[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    const trends = await db
      .select({
        date: attendance.serviceDate,
        present: sql<number>`COUNT(CASE WHEN ${attendance.status} = 'Present' THEN 1 END)::int`,
        total: sql<number>`COUNT(*)::int`,
      })
      .from(attendance)
      .where(
        and(
          sql`${attendance.serviceDate} >= ${startDateStr}`,
          sql`${attendance.serviceDate} <= ${endDateStr}`
        )
      )
      .groupBy(attendance.serviceDate)
      .orderBy(attendance.serviceDate);

    return trends;
  }

  async getMemberStatusDistribution(): Promise<{ status: string; count: number }[]> {
    const distribution = await db
      .select({
        status: members.status,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(members)
      .groupBy(members.status);

    return distribution;
  }

  async getRecentActivity(): Promise<{
    recentMembers: Member[];
    recentFirstTimers: FirstTimer[];
  }> {
    const recentMembers = await db
      .select()
      .from(members)
      .orderBy(desc(members.createdAt))
      .limit(5);

    const recentFirstTimers = await db
      .select()
      .from(firstTimers)
      .where(sql`${firstTimers.convertedToMember} IS NULL`)
      .orderBy(desc(firstTimers.createdAt))
      .limit(5);

    return { recentMembers, recentFirstTimers };
  }

  async sendBulkCommunication(communication: InsertCommunication): Promise<Communication> {
    // Note: This stores the communication record but doesn't actually send SMS/Email
    // In production, this would integrate with Twilio (SMS) or SendGrid (Email)
    // For now, we just log and save the history
    console.log(`[SIMULATED] Sending ${communication.type} to ${communication.recipientCount} recipients`);
    console.log(`Message: ${communication.message}`);
    
    const [record] = await db.insert(communications).values(communication).returning();
    return record;
  }

  async getCommunications(): Promise<Communication[]> {
    const comms = await db
      .select()
      .from(communications)
      .orderBy(desc(communications.createdAt))
      .limit(50);
    
    return comms;
  }

  async getFollowUpTasks(scope: Scope, filters?: {
    assignedTo?: string;
    status?: string;
    memberId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<FollowUpTaskWithMember>> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 25;
    const offset = (page - 1) * limit;

    const conditions = [];
    const scopeCond = this.branchCondition(members, scope);
    if (scopeCond) conditions.push(scopeCond);
    if (filters?.assignedTo) {
      conditions.push(eq(followUpTasks.assignedTo, filters.assignedTo));
    }
    if (filters?.status) {
      conditions.push(eq(followUpTasks.status, filters.status));
    }
    if (filters?.memberId) {
      conditions.push(eq(followUpTasks.memberId, filters.memberId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(followUpTasks)
      .innerJoin(members, eq(followUpTasks.memberId, members.id))
      .where(whereClause);

    let query = db
      .select({
        id: followUpTasks.id,
        memberId: followUpTasks.memberId,
        title: followUpTasks.title,
        description: followUpTasks.description,
        assignedTo: followUpTasks.assignedTo,
        dueDate: followUpTasks.dueDate,
        status: followUpTasks.status,
        priority: followUpTasks.priority,
        completedAt: followUpTasks.completedAt,
        createdAt: followUpTasks.createdAt,
        updatedAt: followUpTasks.updatedAt,
        member: members,
      })
      .from(followUpTasks)
      .innerJoin(members, eq(followUpTasks.memberId, members.id))
      .orderBy(asc(followUpTasks.dueDate))
      .limit(limit)
      .offset(offset);

    if (whereClause) {
      query = query.where(whereClause) as any;
    }

    const data = await query;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getFollowUpTaskById(scope: Scope, id: string): Promise<FollowUpTaskWithMember | undefined> {
    const scopeCond = this.branchCondition(members, scope);
    const [result] = await db
      .select({
        id: followUpTasks.id,
        memberId: followUpTasks.memberId,
        title: followUpTasks.title,
        description: followUpTasks.description,
        assignedTo: followUpTasks.assignedTo,
        dueDate: followUpTasks.dueDate,
        status: followUpTasks.status,
        priority: followUpTasks.priority,
        completedAt: followUpTasks.completedAt,
        createdAt: followUpTasks.createdAt,
        updatedAt: followUpTasks.updatedAt,
        member: members,
      })
      .from(followUpTasks)
      .innerJoin(members, eq(followUpTasks.memberId, members.id))
      .where(scopeCond ? and(eq(followUpTasks.id, id), scopeCond) : eq(followUpTasks.id, id))
      .limit(1);

    return result;
  }

  async createFollowUpTask(task: InsertFollowUpTask): Promise<FollowUpTask> {
    const [newTask] = await db.insert(followUpTasks).values(task).returning();
    return newTask;
  }

  async updateFollowUpTask(scope: Scope, id: string, task: Partial<InsertFollowUpTask>): Promise<FollowUpTask> {
    const memberScope = this.memberScopeSubquery(scope);
    const cond = memberScope
      ? and(eq(followUpTasks.id, id), inArray(followUpTasks.memberId, memberScope))
      : eq(followUpTasks.id, id);
    const [updated] = await db
      .update(followUpTasks)
      .set({ ...task, updatedAt: sql`NOW()` })
      .where(cond)
      .returning();
    if (!updated) throw new Error("Follow-up task not found");
    return updated;
  }

  async deleteFollowUpTask(scope: Scope, id: string): Promise<void> {
    const memberScope = this.memberScopeSubquery(scope);
    const cond = memberScope
      ? and(eq(followUpTasks.id, id), inArray(followUpTasks.memberId, memberScope))
      : eq(followUpTasks.id, id);
    const result = await db.delete(followUpTasks).where(cond).returning({ id: followUpTasks.id });
    if (result.length === 0) throw new Error("Follow-up task not found");
  }

  async completeFollowUpTask(scope: Scope, id: string): Promise<FollowUpTask> {
    const memberScope = this.memberScopeSubquery(scope);
    const cond = memberScope
      ? and(eq(followUpTasks.id, id), inArray(followUpTasks.memberId, memberScope))
      : eq(followUpTasks.id, id);
    const [completed] = await db
      .update(followUpTasks)
      .set({
        status: "Completed",
        completedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(cond)
      .returning();
    if (!completed) throw new Error("Follow-up task not found");
    return completed;
  }

  // Cluster methods
  async getClusters(scope: Scope, branchId?: string): Promise<ClusterWithCells[]> {
    // A scoped (non-super_admin) caller's own scope always wins over a
    // caller-supplied branchId — it's an input, not something to trust.
    const cond = this.clusterScopeCondition(scope) ?? (branchId ? eq(clusters.branchId, branchId) : undefined);
    const clusterList = await (cond
      ? db.select().from(clusters).where(cond).orderBy(clusters.name)
      : db.select().from(clusters).orderBy(clusters.name));

    if (clusterList.length === 0) return [];

    const clusterIds = clusterList.map(c => c.id);
    const allCells = await db.select().from(cells).where(inArray(cells.clusterId, clusterIds));

    const cellsByCluster = new Map<string, Cell[]>();
    for (const cell of allCells) {
      if (!cellsByCluster.has(cell.clusterId)) cellsByCluster.set(cell.clusterId, []);
      cellsByCluster.get(cell.clusterId)!.push(cell);
    }

    return clusterList.map(cluster => {
      const clusterCells = cellsByCluster.get(cluster.id) ?? [];
      return { ...cluster, cells: clusterCells, cellCount: clusterCells.length };
    });
  }

  async getClusterById(scope: Scope, id: string): Promise<Cluster | undefined> {
    const cond = this.clusterScopeCondition(scope);
    const [cluster] = await db.select().from(clusters).where(cond ? and(eq(clusters.id, id), cond) : eq(clusters.id, id));
    return cluster || undefined;
  }

  async createCluster(cluster: InsertCluster): Promise<Cluster> {
    const [newCluster] = await db.insert(clusters).values(cluster).returning();
    return newCluster;
  }

  async updateCluster(scope: Scope, id: string, cluster: Partial<InsertCluster>): Promise<Cluster> {
    const cond = this.clusterScopeCondition(scope);
    const [updated] = await db
      .update(clusters)
      .set({ ...cluster, updatedAt: new Date() })
      .where(cond ? and(eq(clusters.id, id), cond) : eq(clusters.id, id))
      .returning();
    if (!updated) throw new Error("Cluster not found");
    return updated;
  }

  async deleteCluster(scope: Scope, id: string): Promise<void> {
    const cond = this.clusterScopeCondition(scope);
    const [cluster] = await db.select().from(clusters).where(cond ? and(eq(clusters.id, id), cond) : eq(clusters.id, id));
    if (!cluster) throw new Error("Cluster not found");

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(cells)
      .where(eq(cells.clusterId, id));
    if (count > 0) {
      throw new Error(`Cannot delete cluster with ${count} cell(s). Move or delete cells first.`);
    }
    await db.delete(clusters).where(eq(clusters.id, id));
  }

  async getCells(scope: Scope, clusterId?: string): Promise<CellWithMembers[]> {
    const baseQuery = db
      .select({
        id: cells.id,
        name: cells.name,
        clusterId: cells.clusterId,
        leader: cells.leader,
        createdAt: cells.createdAt,
        updatedAt: cells.updatedAt,
        clusterName: clusters.name,
      })
      .from(cells)
      .leftJoin(clusters, eq(cells.clusterId, clusters.id));

    const conditions = [];
    if (clusterId) conditions.push(eq(cells.clusterId, clusterId));
    const scopeCond = this.cellScopeCondition(scope);
    if (scopeCond) conditions.push(scopeCond);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const cellList = await (whereClause
      ? baseQuery.where(whereClause).orderBy(clusters.name, cells.name)
      : baseQuery.orderBy(clusters.name, cells.name));

    if (cellList.length === 0) return [];

    const cellNames = cellList.map(c => c.name);
    const allMembers = await db.select().from(members).where(inArray(members.cell, cellNames));

    const membersByCell = new Map<string, Member[]>();
    for (const m of allMembers) {
      if (m.cell) {
        if (!membersByCell.has(m.cell)) membersByCell.set(m.cell, []);
        membersByCell.get(m.cell)!.push(m);
      }
    }

    return cellList.map(cell => {
      const cellMembers = membersByCell.get(cell.name) ?? [];
      return {
        ...cell,
        clusterName: cell.clusterName ?? undefined,
        members: cellMembers,
        memberCount: cellMembers.length,
      };
    });
  }

  async getCellById(scope: Scope, id: string): Promise<CellWithMembers | undefined> {
    const scopeCond = this.cellScopeCondition(scope);
    const [cell] = await db
      .select({
        id: cells.id,
        name: cells.name,
        clusterId: cells.clusterId,
        leader: cells.leader,
        createdAt: cells.createdAt,
        updatedAt: cells.updatedAt,
        clusterName: clusters.name,
      })
      .from(cells)
      .leftJoin(clusters, eq(cells.clusterId, clusters.id))
      .where(scopeCond ? and(eq(cells.id, id), scopeCond) : eq(cells.id, id));
    if (!cell) return undefined;

    const cellMembers = await db
      .select()
      .from(members)
      .where(eq(members.cell, cell.name));

    return {
      ...cell,
      clusterName: cell.clusterName ?? undefined,
      members: cellMembers,
      memberCount: cellMembers.length,
    };
  }

  async createCell(cell: InsertCell): Promise<Cell> {
    const [newCell] = await db.insert(cells).values(cell).returning();
    return newCell;
  }

  async updateCell(scope: Scope, id: string, cell: Partial<InsertCell>): Promise<Cell> {
    const allowedClusters = this.allowedClusterIdsSubquery(scope);
    const cond = allowedClusters ? and(eq(cells.id, id), inArray(cells.clusterId, allowedClusters)) : eq(cells.id, id);
    const [updated] = await db
      .update(cells)
      .set({ ...cell, updatedAt: new Date() })
      .where(cond)
      .returning();
    if (!updated) throw new Error("Cell not found");
    return updated;
  }

  async deleteCell(scope: Scope, id: string): Promise<void> {
    const allowedClusters = this.allowedClusterIdsSubquery(scope);
    const cond = allowedClusters ? and(eq(cells.id, id), inArray(cells.clusterId, allowedClusters)) : eq(cells.id, id);
    const result = await db.delete(cells).where(cond).returning({ id: cells.id });
    if (result.length === 0) throw new Error("Cell not found");
  }

  async getCellAttendance(scope: Scope, cellId: string, meetingDate?: string): Promise<CellAttendanceWithMember[]> {
    if (!(await this.isCellInScope(cellId, scope))) {
      throw new Error("Cell not found");
    }
    const conditions = [eq(cellAttendance.cellId, cellId)];
    if (meetingDate) {
      conditions.push(eq(cellAttendance.meetingDate, meetingDate));
    }
    
    const records = await db
      .select({
        id: cellAttendance.id,
        cellId: cellAttendance.cellId,
        memberId: cellAttendance.memberId,
        meetingDate: cellAttendance.meetingDate,
        createdAt: cellAttendance.createdAt,
        member: members,
      })
      .from(cellAttendance)
      .innerJoin(members, eq(cellAttendance.memberId, members.id))
      .where(and(...conditions))
      .orderBy(desc(cellAttendance.meetingDate));
    
    return records;
  }

  async getAllCellAttendance(scope: Scope): Promise<CellAttendance[]> {
    const memberScope = this.memberScopeSubquery(scope);
    const query = db.select().from(cellAttendance).orderBy(desc(cellAttendance.meetingDate));
    return memberScope ? await query.where(inArray(cellAttendance.memberId, memberScope)) : await query;
  }

  async recordCellAttendance(scope: Scope, data: InsertCellAttendance): Promise<CellAttendance> {
    if (!(await this.isCellInScope(data.cellId, scope))) {
      throw new Error("Cell not found");
    }
    const existing = await db
      .select()
      .from(cellAttendance)
      .where(
        and(
          eq(cellAttendance.cellId, data.cellId),
          eq(cellAttendance.memberId, data.memberId),
          eq(cellAttendance.meetingDate, data.meetingDate)
        )
      );
    
    if (existing.length > 0) {
      return existing[0];
    }
    
    const [record] = await db.insert(cellAttendance).values(data).returning();
    return record;
  }

  async deleteCellAttendance(scope: Scope, id: string): Promise<void> {
    if (scope.role !== "super_admin") {
      const [record] = await db.select({ cellId: cellAttendance.cellId }).from(cellAttendance).where(eq(cellAttendance.id, id));
      if (!record || !(await this.isCellInScope(record.cellId, scope))) {
        throw new Error("Cell attendance record not found");
      }
    }
    const result = await db.delete(cellAttendance).where(eq(cellAttendance.id, id)).returning({ id: cellAttendance.id });
    if (result.length === 0) throw new Error("Cell attendance record not found");
  }

  async getCellMeetingDates(cellId: string): Promise<string[]> {
    const dates = await db
      .select({ date: cellAttendance.meetingDate })
      .from(cellAttendance)
      .where(eq(cellAttendance.cellId, cellId))
      .groupBy(cellAttendance.meetingDate)
      .orderBy(desc(cellAttendance.meetingDate));
    
    return dates.map(d => d.date);
  }

  // Branch methods
  async getBranches(): Promise<Branch[]> {
    return await db.select().from(branches).orderBy(branches.name);
  }

  async getBranchById(id: string): Promise<Branch | undefined> {
    const [branch] = await db.select().from(branches).where(eq(branches.id, id));
    return branch || undefined;
  }

  async createBranch(branch: InsertBranch): Promise<Branch> {
    const [newBranch] = await db.insert(branches).values(branch).returning();
    return newBranch;
  }

  async updateBranch(id: string, branch: Partial<InsertBranch>): Promise<Branch> {
    const [updated] = await db
      .update(branches)
      .set({ ...branch, updatedAt: new Date() })
      .where(eq(branches.id, id))
      .returning();
    return updated;
  }

  async deleteBranch(id: string): Promise<void> {
    await db.delete(branches).where(eq(branches.id, id));
  }

  // User methods
  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.firstName, users.lastName);
  }

  // User Role methods
  async getAllUsers(): Promise<UserWithRole[]> {
    const allUsers = await db.select().from(users).orderBy(users.firstName, users.lastName);
    if (allUsers.length === 0) return [];

    const userIds = allUsers.map(u => u.id);
    const allRoles = await db.select().from(userRoles).where(inArray(userRoles.userId, userIds));

    const branchIds = Array.from(new Set(allRoles.map(r => r.branchId).filter(Boolean))) as string[];
    const allBranches = branchIds.length > 0
      ? await db.select().from(branches).where(inArray(branches.id, branchIds))
      : [];
    const branchMap = new Map(allBranches.map(b => [b.id, b]));
    const roleByUser = new Map(allRoles.map(r => [r.userId, r]));

    return allUsers.map(user => {
      const role = roleByUser.get(user.id) ?? null;
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role,
        branch: role?.branchId ? branchMap.get(role.branchId) ?? null : null,
      };
    });
  }

  async getUserWithRole(userId: string): Promise<UserWithRole | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return undefined;
    
    const [role] = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    let branch: Branch | null = null;
    if (role?.branchId) {
      const [b] = await db.select().from(branches).where(eq(branches.id, role.branchId));
      branch = b || null;
    }
    
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      role: role || null,
      branch,
    };
  }

  async getUserRole(userId: string): Promise<UserRole | undefined> {
    const [role] = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    return role || undefined;
  }

  async getAllUserRoles(): Promise<UserRole[]> {
    return await db.select().from(userRoles).orderBy(desc(userRoles.createdAt));
  }

  async assignUserRole(data: InsertUserRole): Promise<UserRole> {
    // Check if user already has a role, if so update it
    const existing = await this.getUserRole(data.userId);
    if (existing) {
      return this.updateUserRole(existing.id, data);
    }
    
    const [role] = await db.insert(userRoles).values(data).returning();
    return role;
  }

  async updateUserRole(id: string, data: Partial<InsertUserRole>): Promise<UserRole> {
    const [updated] = await db
      .update(userRoles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userRoles.id, id))
      .returning();
    return updated;
  }

  async deleteUserRole(id: string): Promise<void> {
    await db.delete(userRoles).where(eq(userRoles.id, id));
  }

  async getOutreach(scope: Scope, params?: { branchId?: string; page?: number; limit?: number }): Promise<PaginatedResult<OutreachWithMemberStatus>> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const offset = (page - 1) * limit;

    const whereClause = this.branchCondition(outreach, scope) ?? (params?.branchId ? eq(outreach.branchId, params.branchId) : undefined);

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(outreach)
      .where(whereClause);

    const records = await db.select().from(outreach)
      .where(whereClause)
      .orderBy(desc(outreach.createdAt))
      .limit(limit)
      .offset(offset);

    if (records.length === 0) {
      return { data: [], total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    // Load all member phones (single query, one column — small payload even for 1000+ members)
    const allMemberPhones = await db.select({ mobilePhone: members.mobilePhone }).from(members);
    const memberPhoneSet = new Set(allMemberPhones.map(m => m.mobilePhone.replace(/\s+/g, "")));

    // Only load clusters referenced by this page's records
    const clusterIds = Array.from(new Set(records.map(r => r.clusterId).filter(Boolean))) as string[];
    const relevantClusters = clusterIds.length > 0
      ? await db.select({ id: clusters.id, name: clusters.name }).from(clusters).where(inArray(clusters.id, clusterIds))
      : [];
    const clusterMap = new Map(relevantClusters.map(c => [c.id, c.name]));

    const data = records.map(r => ({
      ...r,
      isMember: memberPhoneSet.has(r.phoneNumber.replace(/\s+/g, "")),
      clusterName: r.clusterId ? clusterMap.get(r.clusterId) ?? null : null,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getOutreachById(scope: Scope, id: string): Promise<Outreach | undefined> {
    const cond = this.branchCondition(outreach, scope);
    const [record] = await db.select().from(outreach).where(cond ? and(eq(outreach.id, id), cond) : eq(outreach.id, id));
    return record;
  }

  async createOutreach(scope: Scope, data: InsertOutreach): Promise<Outreach> {
    const [record] = await db
      .insert(outreach)
      .values({ ...data, branchId: this.pinnedBranchId(scope, data.branchId) })
      .returning();
    return record;
  }

  async updateOutreach(scope: Scope, id: string, data: Partial<InsertOutreach>): Promise<Outreach> {
    const cond = this.branchCondition(outreach, scope);
    const [record] = await db
      .update(outreach)
      .set({ ...data, updatedAt: new Date() })
      .where(cond ? and(eq(outreach.id, id), cond) : eq(outreach.id, id))
      .returning();
    if (!record) throw new Error("Outreach record not found");
    return record;
  }

  async deleteOutreach(scope: Scope, id: string): Promise<void> {
    const cond = this.branchCondition(outreach, scope);
    const result = await db
      .delete(outreach)
      .where(cond ? and(eq(outreach.id, id), cond) : eq(outreach.id, id))
      .returning({ id: outreach.id });
    if (result.length === 0) throw new Error("Outreach record not found");
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createSignupUser(data: { firstName: string; lastName: string; gender: string; address: string; phoneNumber: string; email: string; branchId: string; passwordHash: string }): Promise<User> {
    // Transactional: a self-registered user is granted branch_rep on their
    // own branch immediately, so a crash between the two inserts can't leave
    // them stuck on the "Account Pending" screen with no role to retry into.
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender,
        address: data.address,
        phoneNumber: data.phoneNumber,
        email: data.email,
        branchId: data.branchId,
        passwordHash: data.passwordHash,
      }).returning();
      await tx.insert(userRoles).values({
        userId: user.id,
        role: "branch_rep",
        branchId: data.branchId,
      });
      return user;
    });
  }

  async incrementLoginCount(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ loginCount: sql`${users.loginCount} + 1` })
      .where(eq(users.id, userId));
  }

  async completeOnboarding(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ onboardingCompleted: true })
      .where(eq(users.id, userId));
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void> {
    await db.update(users)
      .set({ passwordResetToken: token, passwordResetExpiry: expiry, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const now = new Date();
    const [user] = await db.select().from(users).where(
      and(eq(users.passwordResetToken, token), gt(users.passwordResetExpiry, now))
    );
    return user;
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    await db.update(users)
      .set({ passwordResetToken: null, passwordResetExpiry: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getRolePermissions(): Promise<Record<string, string[]>> {
    const rows = await db.select().from(rolePermissions);
    if (rows.length === 0) {
      // Return defaults on first access
      return DEFAULT_ROLE_PERMISSIONS;
    }
    const result: Record<string, string[]> = {};
    for (const row of rows) {
      if (!result[row.role]) result[row.role] = [];
      result[row.role].push(row.permission);
    }
    return result;
  }

  async setRolePermissions(data: Record<string, string[]>): Promise<void> {
    await db.delete(rolePermissions);
    const rows = Object.entries(data).flatMap(([role, perms]) =>
      perms.map(permission => ({ role, permission }))
    );
    if (rows.length > 0) {
      await db.insert(rolePermissions).values(rows);
    }
  }

  // SMTP Settings (single global row)
  async getSmtpSettings(): Promise<SmtpSettings | undefined> {
    const rows = await db.select().from(smtpSettings).limit(1);
    return rows[0];
  }

  async upsertSmtpSettings(data: InsertSmtpSettings): Promise<SmtpSettings> {
    const existing = await this.getSmtpSettings();
    if (existing) {
      const [updated] = await db.update(smtpSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(smtpSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(smtpSettings).values(data).returning();
      return created;
    }
  }

  // Email Templates
  async getEmailTemplate(name: string): Promise<EmailTemplate | undefined> {
    const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name)).limit(1);
    return rows[0];
  }

  async upsertEmailTemplate(name: string, data: { subject: string; htmlContent: string }): Promise<EmailTemplate> {
    const existing = await this.getEmailTemplate(name);
    if (existing) {
      const [updated] = await db.update(emailTemplates)
        .set({ subject: data.subject, htmlContent: data.htmlContent, updatedAt: new Date() })
        .where(eq(emailTemplates.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(emailTemplates).values({ name, ...data }).returning();
      return created;
    }
  }

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  async getExecutiveSummary() {
    // Members by status
    const membersByStatus = await db
      .select({ status: members.status, count: sql<number>`COUNT(*)::int` })
      .from(members)
      .groupBy(members.status);

    // Member growth — new members per month for the last 6 months
    const memberGrowth = await (db as any).execute(sql`
      SELECT TO_CHAR(DATE_TRUNC('month', join_date::date), 'Mon YY') AS month,
             COUNT(*)::int AS count
      FROM members
      WHERE join_date::date >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
      GROUP BY DATE_TRUNC('month', join_date::date)
      ORDER BY DATE_TRUNC('month', join_date::date)
    `);

    // Sunday attendance trend — last 8 service dates that have records
    const attendanceTrend = await db
      .select({
        date: attendance.serviceDate,
        present: sql<number>`COUNT(CASE WHEN ${attendance.status} = 'Present' THEN 1 END)::int`,
        total: sql<number>`COUNT(*)::int`,
      })
      .from(attendance)
      .groupBy(attendance.serviceDate)
      .orderBy(desc(attendance.serviceDate))
      .limit(8);

    // First timer stats
    const [ftTotal] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(firstTimers);
    const [ftConverted] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(firstTimers)
      .where(sql`${firstTimers.convertedToMember} IS NOT NULL`);

    // Follow-up task stats
    const [fuTotal] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(followUpTasks);
    const [fuCompleted] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(followUpTasks)
      .where(eq(followUpTasks.status, 'Completed'));

    // Occupation distribution
    const occupationDistribution = await db
      .select({ occupation: members.occupation, count: sql<number>`COUNT(*)::int` })
      .from(members)
      .groupBy(members.occupation);

    // Gender distribution
    const genderDistribution = await db
      .select({ gender: members.gender, count: sql<number>`COUNT(*)::int` })
      .from(members)
      .groupBy(members.gender);

    // Cell attendance by cluster (last 90 days)
    const clusterAttendance = await (db as any).execute(sql`
      SELECT cl.name AS "clusterName", COUNT(ca.id)::int AS "totalAttendance"
      FROM cell_attendance ca
      JOIN cells c ON c.id = ca.cell_id
      JOIN clusters cl ON cl.id = c.cluster_id
      WHERE ca.meeting_date >= NOW() - INTERVAL '90 days'
      GROUP BY cl.name
      ORDER BY "totalAttendance" DESC
    `);

    const ftPending = ftTotal.count - ftConverted.count;
    const fuPending = fuTotal.count - fuCompleted.count;

    return {
      membersByStatus,
      memberGrowth: (memberGrowth.rows as any[]).map(r => ({ month: r.month, count: Number(r.count) })),
      attendanceTrend: attendanceTrend.reverse(),
      firstTimerStats: { total: ftTotal.count, converted: ftConverted.count, pending: ftPending },
      followUpStats: { total: fuTotal.count, completed: fuCompleted.count, pending: fuPending },
      occupationDistribution,
      genderDistribution,
      clusterAttendance: (clusterAttendance.rows as any[]).map(r => ({ clusterName: r.clusterName, totalAttendance: Number(r.totalAttendance) })),
    };
  }

  async getFirstTimerAnalysis() {
    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const quarterStartStr = quarterStart.toISOString().split('T')[0];

    // Conversion stats this quarter
    const [totalThisQtr] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(firstTimers)
      .where(sql`${firstTimers.createdAt} >= ${quarterStartStr}::date`);

    const [convertedThisQtr] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(firstTimers)
      .where(
        and(
          sql`${firstTimers.createdAt} >= ${quarterStartStr}::date`,
          sql`${firstTimers.convertedToMember} IS NOT NULL`
        )
      );

    // Among converted members: how many have 4+ services post-conversion (still attending)
    const convertedMembers = await db
      .select({ memberId: firstTimers.memberId, convertedAt: firstTimers.convertedToMember })
      .from(firstTimers)
      .where(sql`${firstTimers.memberId} IS NOT NULL AND ${firstTimers.convertedToMember} IS NOT NULL`);

    let stillAttendingCount = 0;
    let totalServicesAttended = 0;
    const attendanceFreqMap: Record<string, number> = { '0-1': 0, '2-3': 0, '4-6': 0, '7-9': 0, '10-12': 0 };

    if (convertedMembers.length > 0) {
      const memberIds = convertedMembers.map(m => m.memberId).filter(Boolean) as string[];

      const svcCounts = await db
        .select({
          memberId: attendance.memberId,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(attendance)
        .where(and(inArray(attendance.memberId, memberIds), eq(attendance.status, 'Present')))
        .groupBy(attendance.memberId);

      const svcMap = new Map(svcCounts.map(s => [s.memberId, s.count]));

      for (const cm of convertedMembers) {
        if (!cm.memberId) continue;
        const cnt = svcMap.get(cm.memberId) ?? 0;
        totalServicesAttended += cnt;
        if (cnt >= 4) stillAttendingCount++;
        if (cnt <= 1) attendanceFreqMap['0-1']++;
        else if (cnt <= 3) attendanceFreqMap['2-3']++;
        else if (cnt <= 6) attendanceFreqMap['4-6']++;
        else if (cnt <= 9) attendanceFreqMap['7-9']++;
        else attendanceFreqMap['10-12']++;
      }
    }

    const totalConverted = convertedMembers.length;
    const avgServicesAttended = totalConverted > 0 ? Math.round((totalServicesAttended / totalConverted) * 10) / 10 : 0;
    const droppedOff = totalConverted > 0 ? totalConverted - stillAttendingCount : 0;
    const droppedOffPct = totalConverted > 0 ? Math.round((droppedOff / totalConverted) * 100) : 0;
    const stillAttendingPct = totalConverted > 0 ? Math.round((stillAttendingCount / totalConverted) * 100) : 0;

    const attendanceFrequency = [
      { bucket: '0-1', label: '0–1 visits\n(dropped off)', count: attendanceFreqMap['0-1'] },
      { bucket: '2-3', label: '2–3 visits\n(irregular)', count: attendanceFreqMap['2-3'] },
      { bucket: '4-6', label: '4–6 visits\n(occasional)', count: attendanceFreqMap['4-6'] },
      { bucket: '7-9', label: '7–9 visits\n(regular)', count: attendanceFreqMap['7-9'] },
      { bucket: '10-12', label: '10–12 visits\n(committed)', count: attendanceFreqMap['10-12'] },
    ];

    // Retention by seeing-again intent
    const allFTs = await db
      .select({ seeingAgain: firstTimers.seeingAgain, memberId: firstTimers.memberId })
      .from(firstTimers);

    const intentMap: Record<string, { retained: number; droppedOff: number }> = {
      'Yes': { retained: 0, droppedOff: 0 },
      'Maybe': { retained: 0, droppedOff: 0 },
      'No': { retained: 0, droppedOff: 0 },
    };
    for (const ft of allFTs) {
      const key = ft.seeingAgain in intentMap ? ft.seeingAgain : 'No';
      if (ft.memberId) intentMap[key].retained++;
      else intentMap[key].droppedOff++;
    }
    const retentionBySeeingAgain = Object.entries(intentMap).map(([intent, v]) => ({ intent, ...v }));

    // How heard about
    const howHeardRows = await db
      .select({ source: firstTimers.howHeardAbout, count: sql<number>`COUNT(*)::int` })
      .from(firstTimers)
      .groupBy(firstTimers.howHeardAbout);
    const howHeardAbout = howHeardRows.map(r => ({ source: r.source, count: r.count }));

    // Enjoyed about service — unnest array column
    const enjoyedRows = await (db as any).execute(sql`
      SELECT unnest(enjoyed_about_service) AS aspect, COUNT(*)::int AS count
      FROM first_timers
      GROUP BY aspect
      ORDER BY count DESC
    `);
    const enjoyedAboutService = (enjoyedRows.rows as any[]).map(r => ({ aspect: r.aspect, count: Number(r.count) }));

    return {
      conversionStats: {
        convertedThisQuarter: convertedThisQtr.count,
        totalThisQuarter: totalThisQtr.count,
        stillAttending: stillAttendingCount,
        stillAttendingPct,
        avgServicesAttended,
        droppedOff,
        droppedOffPct,
      },
      attendanceFrequency,
      retentionBySeeingAgain,
      howHeardAbout,
      enjoyedAboutService,
    };
  }

  async getCellAttendanceAnalysis() {
    // Attendance trend — daily counts for last 90 days
    const trendRows = await db
      .select({
        date: cellAttendance.meetingDate,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(cellAttendance)
      .where(sql`${cellAttendance.meetingDate} >= NOW() - INTERVAL '90 days'`)
      .groupBy(cellAttendance.meetingDate)
      .orderBy(cellAttendance.meetingDate);

    // Top cells by total attendance (all time)
    const topCellRows = await (db as any).execute(sql`
      SELECT
        c.name AS "cellName",
        COALESCE(cl.name, 'Unknown') AS "clusterName",
        COUNT(ca.id)::int AS "totalAttendance",
        ROUND(COUNT(ca.id)::numeric / NULLIF(COUNT(DISTINCT ca.meeting_date), 0), 1)::float AS "avgPerMeeting"
      FROM cells c
      LEFT JOIN cell_attendance ca ON ca.cell_id = c.id
      LEFT JOIN clusters cl ON cl.id = c.cluster_id
      GROUP BY c.id, c.name, cl.name
      ORDER BY "totalAttendance" DESC
      LIMIT 10
    `);

    // Cluster comparison
    const clusterRows = await (db as any).execute(sql`
      SELECT
        COALESCE(cl.name, 'Unknown') AS "clusterName",
        COUNT(ca.id)::int AS "totalAttendance",
        COUNT(DISTINCT c.id)::int AS "cellCount",
        ROUND(COUNT(ca.id)::numeric / NULLIF(COUNT(DISTINCT ca.meeting_date || ca.cell_id), 0), 1)::float AS "avgPerMeeting"
      FROM clusters cl
      LEFT JOIN cells c ON c.cluster_id = cl.id
      LEFT JOIN cell_attendance ca ON ca.cell_id = c.id
      GROUP BY cl.id, cl.name
      ORDER BY "totalAttendance" DESC
    `);

    // Recent meetings — last 20 cell meetings
    const recentRows = await (db as any).execute(sql`
      SELECT
        c.name AS "cellName",
        COALESCE(cl.name, 'Unknown') AS "clusterName",
        ca.meeting_date::text AS "meetingDate",
        COUNT(ca.id)::int AS attendees
      FROM cell_attendance ca
      JOIN cells c ON c.id = ca.cell_id
      LEFT JOIN clusters cl ON cl.id = c.cluster_id
      GROUP BY c.name, cl.name, ca.meeting_date
      ORDER BY ca.meeting_date DESC
      LIMIT 20
    `);

    return {
      attendanceTrend: trendRows.map(r => ({ date: r.date as string, count: r.count })),
      topCells: (topCellRows.rows as any[]).map(r => ({
        cellName: r.cellName,
        clusterName: r.clusterName,
        totalAttendance: Number(r.totalAttendance),
        avgPerMeeting: Number(r.avgPerMeeting),
      })),
      clusterComparison: (clusterRows.rows as any[]).map(r => ({
        clusterName: r.clusterName,
        totalAttendance: Number(r.totalAttendance),
        cellCount: Number(r.cellCount),
        avgPerMeeting: Number(r.avgPerMeeting),
      })),
      recentMeetings: (recentRows.rows as any[]).map(r => ({
        cellName: r.cellName,
        clusterName: r.clusterName,
        meetingDate: r.meetingDate,
        attendees: Number(r.attendees),
      })),
    };
  }
}

export const storage = new DatabaseStorage();
