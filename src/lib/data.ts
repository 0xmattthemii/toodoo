import { and, asc, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  projectInvitations,
  projectMembers,
  projects,
  taskAssignees,
  tasks,
  user,
  views,
} from "@/db/schema";
import {
  normalizeBoardConfig,
  type BoardConfig,
  type MemberWithUser,
  type PendingInvitation,
  type Person,
  type ProjectSummary,
  type Role,
  type TaskWithMeta,
  type ViewSummary,
} from "@/lib/types";

/**
 * The position a brand-new membership takes: the bottom of that user's
 * sidebar. Evaluated by Postgres inside the insert, so two projects created
 * at once can't claim the same slot.
 */
export function nextProjectMemberPosition(userId: string) {
  return sql<number>`(select coalesce(max(${projectMembers.position}), 0) + 1 from ${projectMembers} where ${projectMembers.userId} = ${userId})`;
}

/**
 * The position a brand-new task takes: the top of the manual order, matching
 * where a newly created task has always appeared.
 */
export function nextTaskPosition() {
  return sql<number>`(select coalesce(min(${tasks.position}), 1) - 1 from ${tasks})`;
}

/**
 * `case <column> when <id> then <position> … end`: renumbers many rows in one
 * UPDATE, so a request cut short partway through can't leave a list
 * half-reordered. `ids` and `positions` line up by index; callers guard
 * against an empty list, which has no valid CASE.
 */
export function positionCase(
  column: AnyPgColumn,
  ids: string[],
  positions: number[],
) {
  return sql`case ${column} ${sql.join(
    ids.map(
      (id, index) =>
        sql`when ${id}::uuid then ${positions[index]}::double precision`,
    ),
    sql` `,
  )} end`;
}

export async function getUserProjects(
  userId: string,
): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      icon: projects.icon,
      color: projects.color,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, userId))
    .orderBy(asc(projectMembers.position), asc(projects.createdAt));
  return rows;
}

export async function getMembership(projectId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    );
  return membership ?? null;
}

export async function requireMembership(
  projectId: string,
  userId: string,
  role?: Role,
) {
  const membership = await getMembership(projectId, userId);
  if (!membership) {
    throw new Error("You are not a member of this project");
  }
  if (role === "admin" && membership.role !== "admin") {
    throw new Error("Only project admins can do this");
  }
  return membership;
}

export async function getProjectMembers(
  projectId: string,
): Promise<MemberWithUser[]> {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(user, eq(projectMembers.userId, user.id))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt));
}

export async function getPendingInvitations(
  projectId: string,
): Promise<PendingInvitation[]> {
  return db
    .select({
      id: projectInvitations.id,
      email: projectInvitations.email,
      role: projectInvitations.role,
      createdAt: projectInvitations.createdAt,
    })
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.projectId, projectId),
        eq(projectInvitations.status, "pending"),
      ),
    )
    .orderBy(asc(projectInvitations.createdAt));
}

/**
 * People the user can assign tasks to: everyone sharing at least one project,
 * plus the user themselves (for tasks outside any project).
 */
export async function getKnownPeople(userId: string): Promise<Person[]> {
  const myProjects = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));

  const rows = await db
    .selectDistinct({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(projectMembers)
    .innerJoin(user, eq(projectMembers.userId, user.id))
    .where(inArray(projectMembers.projectId, myProjects));

  if (!rows.some((person) => person.id === userId)) {
    const [self] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(user)
      .where(eq(user.id, userId));
    if (self) rows.push(self);
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

async function attachAssignees(
  taskRows: Omit<TaskWithMeta, "assignees">[],
): Promise<TaskWithMeta[]> {
  if (taskRows.length === 0) return [];
  const assigneeRows = await db
    .select({
      taskId: taskAssignees.taskId,
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(taskAssignees)
    .innerJoin(user, eq(taskAssignees.userId, user.id))
    .where(
      inArray(
        taskAssignees.taskId,
        taskRows.map((task) => task.id),
      ),
    );

  const byTask = new Map<string, Person[]>();
  for (const { taskId, ...person } of assigneeRows) {
    const list = byTask.get(taskId) ?? [];
    list.push(person);
    byTask.set(taskId, list);
  }
  return taskRows.map((task) => ({
    ...task,
    assignees: byTask.get(task.id) ?? [],
  }));
}

const taskSelection = {
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  done: tasks.done,
  deadline: tasks.deadline,
  projectId: tasks.projectId,
  projectName: projects.name,
  position: tasks.position,
  createdBy: tasks.createdBy,
  createdAt: tasks.createdAt,
};

/** Tasks the user may see: in their projects, created by them, or assigned. */
function visibleTasksWhere(userId: string) {
  const myProjects = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));

  return or(
    eq(tasks.createdBy, userId),
    inArray(tasks.projectId, myProjects),
    exists(
      db
        .select({ taskId: taskAssignees.taskId })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.taskId, tasks.id),
            eq(taskAssignees.userId, userId),
          ),
        ),
    ),
  );
}

/** Tasks in the user's projects, created by them, or assigned to them. */
export async function getVisibleTasks(userId: string): Promise<TaskWithMeta[]> {
  const rows = await db
    .select(taskSelection)
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(visibleTasksWhere(userId))
    .orderBy(asc(tasks.position), desc(tasks.createdAt));

  return attachAssignees(rows);
}

/**
 * The subset of `taskIds` the user may reorder, with the positions they hold
 * today. One query rather than a per-task permission check, since a reorder
 * touches a whole group at once.
 */
export async function getReorderableTasks(taskIds: string[], userId: string) {
  if (taskIds.length === 0) return [];
  return db
    .select({ id: tasks.id, position: tasks.position })
    .from(tasks)
    .where(and(inArray(tasks.id, taskIds), visibleTasksWhere(userId)));
}

export async function getProjectTasks(
  projectId: string,
): Promise<TaskWithMeta[]> {
  const rows = await db
    .select(taskSelection)
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.position), desc(tasks.createdAt));
  return attachAssignees(rows);
}

export async function getProject(projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  return project ?? null;
}

/** A task is accessible if the user created it, is assigned, or is a member of its project. */
export async function canAccessTask(taskId: string, userId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return null;
  if (task.createdBy === userId) return task;
  const [assignee] = await db
    .select()
    .from(taskAssignees)
    .where(
      and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)),
    );
  if (assignee) return task;
  if (task.projectId) {
    const membership = await getMembership(task.projectId, userId);
    if (membership) return task;
  }
  return null;
}

export async function getUserViews(userId: string): Promise<ViewSummary[]> {
  const rows = await db
    .select()
    .from(views)
    .where(eq(views.ownerId, userId))
    .orderBy(asc(views.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    config: normalizeBoardConfig(row.config as BoardConfig),
  }));
}

export async function getView(
  viewId: string,
  userId: string,
): Promise<ViewSummary | null> {
  const [row] = await db
    .select()
    .from(views)
    .where(and(eq(views.id, viewId), eq(views.ownerId, userId)));
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    config: normalizeBoardConfig(row.config as BoardConfig),
  };
}

/** Turn pending invitations matching the user's email into memberships. */
export async function acceptPendingInvitations(userId: string, email: string) {
  const pending = await db
    .select()
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.email, email.toLowerCase()),
        eq(projectInvitations.status, "pending"),
      ),
    );
  if (pending.length === 0) return;

  for (const invitation of pending) {
    await db
      .insert(projectMembers)
      .values({
        projectId: invitation.projectId,
        userId,
        role: invitation.role,
        position: nextProjectMemberPosition(userId),
      })
      .onConflictDoNothing();
    await db
      .update(projectInvitations)
      .set({ status: "accepted" })
      .where(eq(projectInvitations.id, invitation.id));
  }
}
