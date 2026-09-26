import { eq } from "drizzle-orm";

import { db } from "@/db";
import { projectMembers, projects, taskAssignees, tasks } from "@/db/schema";
import {
  canAccessTask,
  nextProjectMemberPosition,
  nextTaskPosition,
  requireAssignable,
  requireMembership,
  unassignNonMembers,
} from "@/lib/data";
import { parseDeadline } from "@/lib/deadline";

/** The day a deadline names, `null` to clear; throws on anything else. */
function requireDeadline(value: string | null | undefined) {
  if (!value) return null;
  const deadline = parseDeadline(value);
  if (!deadline) throw new Error("Deadline must be a date, e.g. 2026-09-15");
  return deadline;
}

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

  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        name,
        description: input.description?.trim() || null,
        createdBy: userId,
      })
      .returning();
    await tx.insert(projectMembers).values({
      projectId: project.id,
      userId,
      role: "admin",
      position: nextProjectMemberPosition(userId),
    });
    return project;
  });
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
  const deadline = requireDeadline(input.deadline);
  if (input.projectId) {
    await requireMembership(input.projectId, userId);
  }

  const assigneeIds = [...new Set(input.assigneeIds ?? [])];
  await requireAssignable(userId, input.projectId || null, assigneeIds);
  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        title,
        description: input.description?.trim() || null,
        deadline,
        projectId: input.projectId || null,
        position: nextTaskPosition(),
        createdBy: userId,
      })
      .returning();
    if (assigneeIds.length > 0) {
      await tx
        .insert(taskAssignees)
        .values(assigneeIds.map((assignee) => ({ taskId: task.id, userId: assignee })))
        .onConflictDoNothing();
    }
    return task;
  });
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
    patch.deadline = requireDeadline(input.deadline);
  }
  const nextProjectId =
    input.projectId !== undefined ? input.projectId || null : task.projectId;
  const movesProject = nextProjectId !== task.projectId;
  if (movesProject) {
    if (nextProjectId) await requireMembership(nextProjectId, userId);
    patch.projectId = nextProjectId;
  }
  if (input.assigneeIds !== undefined) {
    const current = await db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId));
    await requireAssignable(
      userId,
      nextProjectId,
      input.assigneeIds,
      current.map((row) => row.userId),
    );
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set(patch)
      .where(eq(tasks.id, taskId))
      .returning();

    if (input.assigneeIds !== undefined) {
      const assigneeIds = [...new Set(input.assigneeIds)];
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
      if (assigneeIds.length > 0) {
        await tx
          .insert(taskAssignees)
          .values(assigneeIds.map((assignee) => ({ taskId, userId: assignee })))
          .onConflictDoNothing();
      }
    } else if (movesProject && nextProjectId) {
      // Only the new project's members can see it there.
      await unassignNonMembers(tx, taskId, nextProjectId);
    }
    return updated;
  });
}

export async function deleteTaskFor(userId: string, taskId: string) {
  const task = await canAccessTask(taskId, userId);
  if (!task) throw new Error("Task not found");
  await db.delete(tasks).where(eq(tasks.id, taskId));
}
