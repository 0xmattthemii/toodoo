import { and, asc, desc, eq, exists, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  projectInvitations,
  projectMembers,
  projects,
  taskAssignees,
  tasks,
  user,
} from "@/db/schema";
import type {
  MemberWithUser,
  PendingInvitation,
  Person,
  ProjectSummary,
  Role,
  TaskWithMeta,
} from "@/lib/types";

export async function getUserProjects(
  userId: string,
): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, userId))
    .orderBy(asc(projects.createdAt));
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
  status: tasks.status,
  deadline: tasks.deadline,
  projectId: tasks.projectId,
  projectName: projects.name,
  createdBy: tasks.createdBy,
  createdAt: tasks.createdAt,
};

/** Tasks in the user's projects, created by them, or assigned to them. */
export async function getVisibleTasks(userId: string): Promise<TaskWithMeta[]> {
  const myProjects = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));

  const rows = await db
    .select(taskSelection)
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      or(
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
      ),
    )
    .orderBy(desc(tasks.createdAt));

  return attachAssignees(rows);
}

export async function getProjectTasks(
  projectId: string,
): Promise<TaskWithMeta[]> {
  const rows = await db
    .select(taskSelection)
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(desc(tasks.createdAt));
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
      })
      .onConflictDoNothing();
    await db
      .update(projectInvitations)
      .set({ status: "accepted" })
      .where(eq(projectInvitations.id, invitation.id));
  }
}
