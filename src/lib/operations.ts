import { eq } from "drizzle-orm";

import { db } from "@/db";
import { projectMembers, projects, taskAssignees, tasks } from "@/db/schema";
import { canAccessTask, requireMembership } from "@/lib/data";

/**
 * User-scoped mutations shared by surfaces that don't carry a cookie session
 * (the MCP server). Permission checks mirror the server actions.
 */

export async function createProjectFor(
  userId: string,
  input: { name: string; description?: string | null },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");

  const [project] = await db
    .insert(projects)
    .values({
      name,
      description: input.description?.trim() || null,
      createdBy: userId,
    })
    .returning();

  await db.insert(projectMembers).values({
    projectId: project.id,
    userId,
    role: "admin",
  });

  return project;
}

export async function createTaskFor(
  userId: string,
  input: {
    title: string;
    description?: string | null;
    deadline?: string | null;
    projectId?: string | null;
    assigneeIds?: string[];
  },
) {
  const title = input.title.trim();
  if (!title) throw new Error("Task title is required");
  if (input.projectId) {
    await requireMembership(input.projectId, userId);
  }

  const [task] = await db
    .insert(tasks)
    .values({
      title,
      description: input.description?.trim() || null,
      deadline: input.deadline ? new Date(input.deadline) : null,
      projectId: input.projectId || null,
      createdBy: userId,
    })
    .returning();

  const assigneeIds = [...new Set(input.assigneeIds ?? [])];
  if (assigneeIds.length > 0) {
    await db
      .insert(taskAssignees)
      .values(assigneeIds.map((assignee) => ({ taskId: task.id, userId: assignee })))
      .onConflictDoNothing();
  }
  return task;
}

/** Partial update; only provided fields change. `deadline: null` clears it. */
export async function updateTaskFor(
  userId: string,
  taskId: string,
  input: {
    title?: string;
    description?: string | null;
    done?: boolean;
    deadline?: string | null;
    projectId?: string | null;
    assigneeIds?: string[];
  },
) {
  const task = await canAccessTask(taskId, userId);
  if (!task) throw new Error("Task not found");

  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new Error("Task title cannot be empty");
    patch.title = title;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.done !== undefined) patch.done = input.done;
  if (input.deadline !== undefined) {
    patch.deadline = input.deadline ? new Date(input.deadline) : null;
  }
  if (input.projectId !== undefined) {
    const nextProjectId = input.projectId || null;
    if (nextProjectId && nextProjectId !== task.projectId) {
      await requireMembership(nextProjectId, userId);
    }
    patch.projectId = nextProjectId;
  }

  const [updated] = await db
    .update(tasks)
    .set(patch)
    .where(eq(tasks.id, taskId))
    .returning();

  if (input.assigneeIds !== undefined) {
    const assigneeIds = [...new Set(input.assigneeIds)];
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
    if (assigneeIds.length > 0) {
      await db
        .insert(taskAssignees)
        .values(assigneeIds.map((assignee) => ({ taskId, userId: assignee })))
        .onConflictDoNothing();
    }
  }
  return updated;
}

export async function deleteTaskFor(userId: string, taskId: string) {
  const task = await canAccessTask(taskId, userId);
  if (!task) throw new Error("Task not found");
  await db.delete(tasks).where(eq(tasks.id, taskId));
}
