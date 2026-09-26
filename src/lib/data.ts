import { and, asc, desc, eq, exists, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
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
import type {
  ProjectInvitation,
  ProjectMembership,
  WorkspaceSnapshot,
} from "@/lib/workspace";

/** The database, or a transaction on it: whatever a query should run on. */
export type Executor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export async function getMembership(
  projectId: string,
  userId: string,
  executor: Executor = db,
) {
  const [membership] = await executor
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
  executor: Executor = db,
) {
  const membership = await getMembership(projectId, userId, executor);
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
 * Runs `fn` in a transaction that holds a row lock on the project, so that
 * changes to its membership happen one at a time. Rules such as "a project
 * keeps at least one admin" are a count read before a write; two requests
 * reading the count side by side would both pass it (two admins each
 * stepping down leave none). Whoever takes the lock second waits, then reads
 * what the first committed. Checks that depend on the membership — including
 * the caller's own permission — belong inside `fn`, on `tx`.
 */
export async function withProjectLock<T>(
  projectId: string,
  fn: (tx: Executor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    if (!locked) throw new Error("Project not found");
    return fn(tx);
  });
}

/**
 * Refuses assignees who could never see the task: on a project task anyone
 * who isn't a member of that project; on a task outside any project anyone
 * the user doesn't share a project with (the people the task dialog offers).
 * `keep` are the task's current assignees, allowed to stay on a task outside
 * any project even once the two stop sharing one.
 */
export async function requireAssignable(
  userId: string,
  projectId: string | null,
  assigneeIds: string[],
  keep: string[] = [],
) {
  // Outside a project, you can always take a task yourself.
  const candidates = projectId
    ? assigneeIds
    : assigneeIds.filter((id) => id !== userId);
  if (candidates.length === 0) return;

  const rows = await db
    .selectDistinct({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(
      and(
        inArray(projectMembers.userId, candidates),
        projectId
          ? eq(projectMembers.projectId, projectId)
          : inArray(
              projectMembers.projectId,
              db
                .select({ id: projectMembers.projectId })
                .from(projectMembers)
                .where(eq(projectMembers.userId, userId)),
            ),
      ),
    );
  const allowed = new Set(rows.map((row) => row.userId));
  if (!projectId) keep.forEach((id) => allowed.add(id));
  if (candidates.some((id) => !allowed.has(id))) {
    throw new Error(
      projectId
        ? "Tasks can only be assigned to members of their project"
        : "Tasks can only be assigned to people you share a project with",
    );
  }
}

/**
 * Unassigns everyone on the task who isn't a member of `projectId` — run when
 * a task moves into a project, whose members are the only ones who can see
 * it there.
 */
export async function unassignNonMembers(
  executor: Executor,
  taskId: string,
  projectId: string,
) {
  await executor
    .delete(taskAssignees)
    .where(
      and(
        eq(taskAssignees.taskId, taskId),
        notInArray(
          taskAssignees.userId,
          executor
            .select({ userId: projectMembers.userId })
            .from(projectMembers)
            .where(eq(projectMembers.projectId, projectId)),
        ),
      ),
    );
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

/**
 * Tasks the user may see, the same rule as `canAccessTask`. A project's tasks
 * belong to the project: its current members see them, and nobody else —
 * not even whoever created one or is assigned to it, so removing someone
 * from a project takes all of its tasks away from them. A task outside any
 * project is its creator's and its assignees'.
 */
function visibleTasksWhere(userId: string) {
  const myProjects = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));

  return or(
    inArray(tasks.projectId, myProjects),
    and(
      isNull(tasks.projectId),
      or(
        eq(tasks.createdBy, userId),
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
      ),
    ),
  );
}

/** Tasks in the user's projects, and their own or assigned tasks outside any. */
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

/**
 * The task, if the user may see and change it: a member of its project, or
 * for a task outside any project its creator or an assignee. See
 * `visibleTasksWhere`, which is the same rule as a query.
 */
export async function canAccessTask(taskId: string, userId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return null;
  if (task.projectId) {
    const membership = await getMembership(task.projectId, userId);
    return membership ? task : null;
  }
  if (task.createdBy === userId) return task;
  const [assignee] = await db
    .select()
    .from(taskAssignees)
    .where(
      and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)),
    );
  return assignee ? task : null;
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

/**
 * Turns pending invitations to the user's email address into memberships —
 * once that address is verified. An invitation is addressed to a mailbox,
 * and an account merely *claims* one: a password sign-up works before its
 * owner has clicked anything in their inbox. Without this check, anyone who
 * registered an invited address before its owner did would walk into the
 * project, as an admin if that is what the invitation was for. Unverified
 * accounts keep their invitations pending; they are accepted on the first
 * page load after the address is verified (or a Google sign-in, which
 * verifies it).
 */
export async function acceptPendingInvitations(userId: string) {
  const [account] = await db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId));
  if (!account?.emailVerified) return;

  const pending = await db
    .select()
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.email, account.email.toLowerCase()),
        eq(projectInvitations.status, "pending"),
      ),
    );

  for (const invitation of pending) {
    // Claiming the invitation and joining commit together, and only the
    // request that flips it from pending joins.
    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(projectInvitations)
        .set({ status: "accepted" })
        .where(
          and(
            eq(projectInvitations.id, invitation.id),
            eq(projectInvitations.status, "pending"),
          ),
        )
        .returning({ id: projectInvitations.id });
      if (!claimed) return;
      await tx
        .insert(projectMembers)
        .values({
          projectId: invitation.projectId,
          userId,
          role: invitation.role,
          position: nextProjectMemberPosition(userId),
        })
        .onConflictDoNothing();
    });
  }
}

/** Every membership of every project the user belongs to, the user's own included. */
export async function getProjectMemberships(
  userId: string,
): Promise<ProjectMembership[]> {
  const myProjects = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));

  const rows = await db
    .select({
      projectId: projectMembers.projectId,
      role: projectMembers.role,
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(projectMembers)
    .innerJoin(user, eq(projectMembers.userId, user.id))
    .where(inArray(projectMembers.projectId, myProjects))
    .orderBy(asc(projectMembers.createdAt));

  return rows.map(({ projectId, role, ...person }) => ({
    projectId,
    role,
    user: person,
  }));
}

/** Pending invitations of the projects the user administers. */
export async function getAdminInvitations(
  userId: string,
): Promise<ProjectInvitation[]> {
  const adminProjects = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.userId, userId), eq(projectMembers.role, "admin")),
    );

  return db
    .select({
      id: projectInvitations.id,
      projectId: projectInvitations.projectId,
      email: projectInvitations.email,
      role: projectInvitations.role,
      createdAt: projectInvitations.createdAt,
    })
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.status, "pending"),
        inArray(projectInvitations.projectId, adminProjects),
      ),
    )
    .orderBy(asc(projectInvitations.createdAt));
}

/**
 * Everything the app shell hands to the client in one go. The queries are
 * independent, so they run as a single round of parallel requests.
 */
export async function getWorkspaceSnapshot(
  me: Person,
): Promise<WorkspaceSnapshot> {
  const [projects, views, tasks, memberships, invitations] = await Promise.all([
    getUserProjects(me.id),
    getUserViews(me.id),
    getVisibleTasks(me.id),
    getProjectMemberships(me.id),
    getAdminInvitations(me.id),
  ]);
  return { at: Date.now(), me, projects, views, tasks, memberships, invitations };
}
