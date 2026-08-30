"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { projectMembers, projects } from "@/db/schema";
import { requireMembership } from "@/lib/data";
import { requireSession } from "@/lib/session";

export async function createProject(input: {
  name: string;
  description?: string;
}) {
  const session = await requireSession();
  const name = input.name.trim();
  if (!name) return { error: "Project name is required" };

  const [project] = await db
    .insert(projects)
    .values({
      name,
      description: input.description?.trim() || null,
      createdBy: session.user.id,
    })
    .returning();

  await db.insert(projectMembers).values({
    projectId: project.id,
    userId: session.user.id,
    role: "admin",
  });

  revalidatePath("/", "layout");
  return { projectId: project.id };
}

export async function updateProject(
  projectId: string,
  input: { name: string; description?: string },
) {
  const session = await requireSession();
  await requireMembership(projectId, session.user.id, "admin");
  const name = input.name.trim();
  if (!name) return { error: "Project name is required" };

  await db
    .update(projects)
    .set({ name, description: input.description?.trim() || null })
    .where(eq(projects.id, projectId));

  revalidatePath("/", "layout");
  return { error: undefined };
}

export async function deleteProject(projectId: string) {
  const session = await requireSession();
  await requireMembership(projectId, session.user.id, "admin");
  await db.delete(projects).where(eq(projects.id, projectId));
  revalidatePath("/", "layout");
  redirect("/");
}
