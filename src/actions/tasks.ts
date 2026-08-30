"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { taskAssignees, tasks } from "@/db/schema";
import { canAccessTask, requireMembership } from "@/lib/data";
import { requireSession } from "@/lib/session";
import type { TaskStatus } from "@/lib/types";

type TaskInput = {
  title: string;
  description?: string;
  status?: TaskStatus;
  deadline?: string | null; // ISO string
  projectId?: string | null;
  assigneeIds?: string[];
};

export async function createTask(input: TaskInput) {
  const session = await requireSession();
  const title = input.title.trim();
  if (!title) return { error: "Task title is required" };

  if (input.projectId) {
    await requireMembership(input.projectId, session.user.id);
  }

  const [task] = await db
    .insert(tasks)
    .values({
      title,
      description: input.description?.trim() || null,
      status: input.status ?? "todo",
      deadline: input.deadline ? new Date(input.deadline) : null,
      projectId: input.projectId || null,
      createdBy: session.user.id,
    })
    .returning();

  const assigneeIds = [...new Set(input.assigneeIds ?? [])];
  if (assigneeIds.length > 0) {
    await db
      .insert(taskAssignees)
      .values(assigneeIds.map((userId) => ({ taskId: task.id, userId })))
      .onConflictDoNothing();
  }

  revalidatePath("/", "layout");
  return { taskId: task.id };
}

export async function updateTask(taskId: string, input: TaskInput) {
  const session = await requireSession();
  const task = await canAccessTask(taskId, session.user.id);
  if (!task) return { error: "Task not found" };

  const title = input.title.trim();
  if (!title) return { error: "Task title is required" };

  const nextProjectId = input.projectId || null;
  if (nextProjectId && nextProjectId !== task.projectId) {
    await requireMembership(nextProjectId, session.user.id);
  }

  await db
    .update(tasks)
    .set({
      title,
      description: input.description?.trim() || null,
      status: input.status ?? task.status,
      deadline: input.deadline ? new Date(input.deadline) : null,
      projectId: nextProjectId,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  if (input.assigneeIds) {
    const assigneeIds = [...new Set(input.assigneeIds)];
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
    if (assigneeIds.length > 0) {
      await db
        .insert(taskAssignees)
        .values(assigneeIds.map((userId) => ({ taskId, userId })))
        .onConflictDoNothing();
    }
  }

  revalidatePath("/", "layout");
  return { error: undefined };
}

export async function setTaskStatus(taskId: string, status: TaskStatus) {
  const session = await requireSession();
  const task = await canAccessTask(taskId, session.user.id);
  if (!task) return { error: "Task not found" };

  await db
    .update(tasks)
    .set({ status, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
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
