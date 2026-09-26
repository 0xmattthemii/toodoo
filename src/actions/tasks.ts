"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { taskAssignees, tasks } from "@/db/schema";
import {
  canAccessTask,
  getReorderableTasks,
  nextTaskPosition,
  positionCase,
  requireAssignable,
  requireMembership,
  unassignNonMembers,
} from "@/lib/data";
import { parseDeadline } from "@/lib/deadline";
import { isValidId } from "@/lib/ids";
import { positionSlots } from "@/lib/ordering";
import { requireSession } from "@/lib/session";

type TaskInput = {
  title: string;
  description?: string;
  deadline?: string | null; // YYYY-MM-DD, see lib/deadline.ts
  projectId?: string | null;
  assigneeIds?: string[];
};

async function currentAssigneeIds(taskId: string) {
  const rows = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId));
  return rows.map((row) => row.userId);
}

export async function createTask(input: TaskInput & { id?: string }) {
  const session = await requireSession();
  const title = input.title.trim();
  if (!title) return { error: "Task title is required" };
  if (input.id !== undefined && !isValidId(input.id)) {
    return { error: "Invalid task id" };
  }

  const deadline = input.deadline ? parseDeadline(input.deadline) : null;
  if (deadline === undefined) return { error: "Invalid deadline" };

  if (input.projectId) {
    await requireMembership(input.projectId, session.user.id);
  }

  const assigneeIds = [...new Set(input.assigneeIds ?? [])];
  await requireAssignable(session.user.id, input.projectId || null, assigneeIds);
  const task = await db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        id: input.id,
        title,
        description: input.description?.trim() || null,
        deadline,
        projectId: input.projectId || null,
        position: nextTaskPosition(),
        createdBy: session.user.id,
      })
      .returning();
    if (assigneeIds.length > 0) {
      await tx
        .insert(taskAssignees)
        .values(assigneeIds.map((userId) => ({ taskId: task.id, userId })))
        .onConflictDoNothing();
    }
    return task;
  });

  revalidatePath("/", "layout");
  return { taskId: task.id };
}

export async function updateTask(taskId: string, input: TaskInput) {
  const session = await requireSession();
  const task = await canAccessTask(taskId, session.user.id);
  if (!task) return { error: "Task not found" };

  const title = input.title.trim();
  if (!title) return { error: "Task title is required" };
  const deadline = input.deadline ? parseDeadline(input.deadline) : null;
  if (deadline === undefined) return { error: "Invalid deadline" };

  const nextProjectId = input.projectId || null;
  if (nextProjectId && nextProjectId !== task.projectId) {
    await requireMembership(nextProjectId, session.user.id);
  }
  if (input.assigneeIds) {
    await requireAssignable(
      session.user.id,
      nextProjectId,
      input.assigneeIds,
      await currentAssigneeIds(taskId),
    );
  }

  // Replacing the assignees is a delete followed by an insert; without a
  // transaction a failure between the two silently unassigns the task.
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        title,
        description: input.description?.trim() || null,
        deadline,
        projectId: nextProjectId,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    if (input.assigneeIds) {
      const assigneeIds = [...new Set(input.assigneeIds)];
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
      if (assigneeIds.length > 0) {
        await tx
          .insert(taskAssignees)
          .values(assigneeIds.map((userId) => ({ taskId, userId })))
          .onConflictDoNothing();
      }
    }
  });

  revalidatePath("/", "layout");
  return { error: undefined };
}

export async function setTaskDone(taskId: string, done: boolean) {
  const session = await requireSession();
  const task = await canAccessTask(taskId, session.user.id);
  if (!task) return { error: "Task not found" };

  await db
    .update(tasks)
    .set({ done, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  revalidatePath("/", "layout");
  return { error: undefined };
}

export async function moveTaskToProject(
  taskId: string,
  projectId: string | null,
) {
  const session = await requireSession();
  const task = await canAccessTask(taskId, session.user.id);
  if (!task) return { error: "Task not found" };

  if (projectId && projectId !== task.projectId) {
    await requireMembership(projectId, session.user.id);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ projectId, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    // Only the project's members can see it there.
    if (projectId && projectId !== task.projectId) {
      await unassignNonMembers(tx, taskId, projectId);
    }
  });
  revalidatePath("/", "layout");
  return { error: undefined };
}

/** How many tasks one drag may renumber — a whole board group, with room. */
const REORDER_LIMIT = 1000;

/**
 * Writes a manual order for one board group, given its task ids in their new
 * order. The group's tasks swap around inside the position slots they already
 * hold, so tasks outside the group keep their place in the overall order.
 */
export async function reorderTasks(orderedIds: string[]) {
  const session = await requireSession();

  const unique = new Set(orderedIds);
  if (unique.size !== orderedIds.length) {
    return { error: "The same task appears twice in the new order" };
  }
  if (orderedIds.length > REORDER_LIMIT) {
    return { error: "That's too many tasks to reorder at once" };
  }
  if (orderedIds.length < 2) return { error: undefined };

  const rows = await getReorderableTasks(orderedIds, session.user.id);
  if (rows.length !== orderedIds.length) return { error: "Task not found" };

  const slots = positionSlots(rows.map((row) => row.position));

  await db
    .update(tasks)
    .set({ position: positionCase(tasks.id, orderedIds, slots) })
    .where(inArray(tasks.id, orderedIds));

  revalidatePath("/", "layout");
  return { error: undefined };
}

export async function deleteTask(taskId: string) {
  const session = await requireSession();
  const task = await canAccessTask(taskId, session.user.id);
  if (!task) return { error: "Task not found" };

  await db.delete(tasks).where(eq(tasks.id, taskId));
  revalidatePath("/", "layout");
  return { error: undefined };
}
