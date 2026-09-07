"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { projectMembers, projects } from "@/db/schema";
import {
  nextProjectMemberPosition,
  positionCase,
  requireMembership,
} from "@/lib/data";
import { isValidId } from "@/lib/ids";
import { requireSession } from "@/lib/session";

export async function createProject(input: {
  id?: string;
  name: string;
  description?: string;
  icon?: string | null;
  color?: string | null;
}) {
  const session = await requireSession();
  const name = input.name.trim();
  if (!name) return { error: "Project name is required" };
  if (input.id !== undefined && !isValidId(input.id)) {
    return { error: "Invalid project id" };
  }

  // One transaction: a project row without its admin membership would be
  // invisible in the sidebar and impossible to delete.
  const project = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        id: input.id,
        name,
        description: input.description?.trim() || null,
        icon: input.icon || null,
        color: input.color || null,
        createdBy: session.user.id,
      })
      .returning();
    await tx.insert(projectMembers).values({
      projectId: project.id,
      userId: session.user.id,
      role: "admin",
      position: nextProjectMemberPosition(session.user.id),
    });
    return project;
  });

  revalidatePath("/", "layout");
  return { projectId: project.id };
}

export async function updateProject(
  projectId: string,
  input: {
    name: string;
    description?: string;
    icon?: string | null;
    color?: string | null;
  },
) {
  const session = await requireSession();
  await requireMembership(projectId, session.user.id, "admin");
  const name = input.name.trim();
  if (!name) return { error: "Project name is required" };

  await db
    .update(projects)
    .set({
      name,
      description: input.description?.trim() || null,
      icon: input.icon || null,
      color: input.color || null,
    })
    .where(eq(projects.id, projectId));

  revalidatePath("/", "layout");
  return { error: undefined };
}

/**
 * Reorders the sidebar for the signed-in user only: the order lives on their
 * membership rows, so the people they share a project with keep their own.
 * Expects every project they belong to, since the sidebar shows all of them.
 */
export async function reorderProjects(orderedIds: string[]) {
  const session = await requireSession();
  if (orderedIds.length < 2) return { error: undefined };

  const memberships = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, session.user.id));

  const mine = new Set(memberships.map((row) => row.projectId));
  const requested = new Set(orderedIds);
  if (
    requested.size !== orderedIds.length ||
    requested.size !== mine.size ||
    orderedIds.some((projectId) => !mine.has(projectId))
  ) {
    return { error: "That order doesn't match your projects" };
  }

  await db
    .update(projectMembers)
    .set({
      position: positionCase(
        projectMembers.projectId,
        orderedIds,
        orderedIds.map((_, index) => index),
      ),
    })
    .where(
      and(
        eq(projectMembers.userId, session.user.id),
        inArray(projectMembers.projectId, orderedIds),
      ),
    );

  revalidatePath("/", "layout");
  return { error: undefined };
}

/** The client leaves the project's page itself, before the request is sent. */
export async function deleteProject(projectId: string) {
  const session = await requireSession();
  await requireMembership(projectId, session.user.id, "admin");
  await db.delete(projects).where(eq(projects.id, projectId));
  revalidatePath("/", "layout");
  return { error: undefined };
}
