"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { projectInvitations, projectMembers, user } from "@/db/schema";
import { requireMembership } from "@/lib/data";
import { requireSession } from "@/lib/session";
import type { Role } from "@/lib/types";

export async function inviteToProject(
  projectId: string,
  email: string,
  role: Role = "member",
) {
  const session = await requireSession();
  await requireMembership(projectId, session.user.id, "admin");

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { error: "Enter a valid email address" };
  }

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normalized));

  if (existing) {
    const inserted = await db
      .insert(projectMembers)
      .values({ projectId, userId: existing.id, role })
      .onConflictDoNothing()
      .returning();
    revalidatePath("/", "layout");
    return inserted.length === 0
      ? { error: "That person is already a member" }
      : { added: true as const };
  }

  const inserted = await db
    .insert(projectInvitations)
    .values({ projectId, email: normalized, role, invitedBy: session.user.id })
    .onConflictDoNothing()
    .returning();
  revalidatePath("/", "layout");
  return inserted.length === 0
    ? { error: "That email has already been invited" }
    : { invited: true as const };
}

export async function revokeInvitation(projectId: string, invitationId: string) {
  const session = await requireSession();
  await requireMembership(projectId, session.user.id, "admin");
  await db
    .delete(projectInvitations)
    .where(
      and(
        eq(projectInvitations.id, invitationId),
        eq(projectInvitations.projectId, projectId),
      ),
    );
  revalidatePath("/", "layout");
  return { error: undefined };
}

async function countAdmins(projectId: string) {
  const admins = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.role, "admin"),
      ),
    );
  return admins.length;
}

export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: Role,
) {
  const session = await requireSession();
  await requireMembership(projectId, session.user.id, "admin");

  if (role === "member") {
    const membership = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      );
    if (
      membership[0]?.role === "admin" &&
      (await countAdmins(projectId)) <= 1
    ) {
      return { error: "A project needs at least one admin" };
    }
  }

  await db
    .update(projectMembers)
    .set({ role })
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    );
  revalidatePath("/", "layout");
  return { error: undefined };
}

export async function removeMember(projectId: string, userId: string) {
  const session = await requireSession();
  const isSelf = userId === session.user.id;
  if (!isSelf) {
    await requireMembership(projectId, session.user.id, "admin");
  } else {
    await requireMembership(projectId, session.user.id);
  }

  const [target] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    );
  if (!target) return { error: "Not a member" };
  if (target.role === "admin" && (await countAdmins(projectId)) <= 1) {
    return { error: "A project needs at least one admin" };
  }

  await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    );
  revalidatePath("/", "layout");
  return { removedSelf: isSelf };
}
