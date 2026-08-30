"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { views } from "@/db/schema";
import { requireSession } from "@/lib/session";
import type { BoardConfig } from "@/lib/types";

function sanitizeConfig(config: BoardConfig): BoardConfig {
  return {
    mode: config.mode === "kanban" ? "kanban" : "list",
    groupBy: ["project", "assignee", "deadline", "none"].includes(
      config.groupBy,
    )
      ? config.groupBy
      : "none",
    filters: (config.filters ?? [])
      .filter(
        (filter) =>
          ["assignee", "project", "deadline"].includes(filter.field) &&
          typeof filter.value === "string",
      )
      .slice(0, 20),
  };
}

export async function createView(input: {
  name: string;
  icon?: string | null;
  color?: string | null;
  config: BoardConfig;
}) {
  const session = await requireSession();
  const name = input.name.trim();
  if (!name) return { error: "View name is required" };

  const [view] = await db
    .insert(views)
    .values({
      name,
      icon: input.icon || null,
      color: input.color || null,
      ownerId: session.user.id,
      config: sanitizeConfig(input.config),
    })
    .returning();

  revalidatePath("/", "layout");
  return { viewId: view.id };
}

export async function updateView(
  viewId: string,
  input: {
    name?: string;
    icon?: string | null;
    color?: string | null;
    config?: BoardConfig;
  },
) {
  const session = await requireSession();

  const patch: Partial<typeof views.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { error: "View name is required" };
    patch.name = name;
  }
  if (input.icon !== undefined) patch.icon = input.icon || null;
  if (input.color !== undefined) patch.color = input.color || null;
  if (input.config !== undefined) patch.config = sanitizeConfig(input.config);

  const updated = await db
    .update(views)
    .set(patch)
    .where(and(eq(views.id, viewId), eq(views.ownerId, session.user.id)))
    .returning();
  if (updated.length === 0) return { error: "View not found" };

  revalidatePath("/", "layout");
  return { error: undefined };
}

export async function deleteView(viewId: string) {
  const session = await requireSession();
  await db
    .delete(views)
    .where(and(eq(views.id, viewId), eq(views.ownerId, session.user.id)));
  revalidatePath("/", "layout");
  redirect("/");
}
