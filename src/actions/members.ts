"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  projectInvitations,
  projectMembers,
  taskAssignees,
  tasks,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { allowedEmailDomains, isEmailDomainAllowed } from "@/lib/auth-flags";
import {
  getMembership,
  getProject,
  nextProjectMemberPosition,
  requireMembership,
  withProjectLock,
  type Executor,
} from "@/lib/data";
import { appUrl, sendEmail } from "@/lib/email";
import { requireSession } from "@/lib/session";
import { isRole, type Role } from "@/lib/types";
import { formatEmailDomains } from "@/lib/utils";

export async function inviteToProject(
  projectId: string,
  email: string,
  role: Role = "member",
) {
  const session = await requireSession();
  await requireMembership(projectId, session.user.id, "admin");
  if (!isRole(role)) return { error: "Unknown role" };

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { error: "Enter a valid email address" };
  }
  // A domain-locked instance can't let this invite be redeemed — the sign-up
  // would be rejected — so surface that to the admin instead of sending an
  // invitation that dead-ends.
  if (!isEmailDomainAllowed(normalized)) {
    return {
      error: `This instance only allows ${formatEmailDomains(allowedEmailDomains())} accounts`,
    };
  }

  const [existing] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(eq(user.email, normalized));

  const project = await getProject(projectId);
  const inviter = session.user.name;

  // Only an account that has proven it owns the address joins right away.
  // Anyone else — no account yet, or one whose address isn't verified — gets
  // an invitation that waits for the verification (acceptPendingInvitations).
  if (existing?.emailVerified) {
    const inserted = await db
      .insert(projectMembers)
      .values({
        projectId,
        userId: existing.id,
        role,
        position: nextProjectMemberPosition(existing.id),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      return { error: "That person is already a member" };
    }
    try {
      await sendEmail({
        to: normalized,
        subject: `${inviter} added you to ${project?.name ?? "a project"} on toodoo`,
        heading: `You've been added to ${project?.name ?? "a project"}`,
        body: `${inviter} added you to the project "${project?.name ?? ""}" on toodoo. You can see its tasks right away.`,
        actionLabel: "Open the project",
        actionUrl: appUrl(`/projects/${projectId}`),
      });
    } catch (error) {
      console.error("[email] failed to send member-added email", error);
    }
    revalidatePath("/", "layout");
    const { id, name, image } = existing;
    return {
      added: true as const,
      member: { id, name, email: existing.email, image, role },
    };
  }

  if (existing && (await getMembership(projectId, existing.id))) {
    return { error: "That person is already a member" };
  }

  const inserted = await db
    .insert(projectInvitations)
    .values({ projectId, email: normalized, role, invitedBy: session.user.id })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) {
    return { error: "That email has already been invited" };
  }
  try {
    if (existing) {
      // Verification links expire within the hour, so the one sent at
      // sign-up is likely long dead: send a fresh one to go with this.
      await auth.api.sendVerificationEmail({
        body: { email: normalized, callbackURL: `/projects/${projectId}` },
      });
      await sendEmail({
        to: normalized,
        subject: `${inviter} invited you to ${project?.name ?? "a project"} on toodoo`,
        heading: `${inviter} invited you to ${project?.name ?? "a project"}`,
        body: `${inviter} invited you to collaborate on "${project?.name ?? "a project"}". Confirm your email address with the verification link we've just sent you, and you'll join the project automatically.`,
        actionLabel: "Open toodoo",
        actionUrl: appUrl("/"),
      });
    } else {
      await sendEmail({
        to: normalized,
        subject: `${inviter} invited you to ${project?.name ?? "a project"} on toodoo`,
        heading: `${inviter} invited you to toodoo`,
        body: `${inviter} invited you to collaborate on "${project?.name ?? "a project"}". Create an account with this email address and confirm it, and you'll join the project automatically.`,
        actionLabel: "Sign up",
        actionUrl: appUrl("/signup"),
      });
    }
  } catch (error) {
    console.error("[email] failed to send invitation email", error);
  }
  revalidatePath("/", "layout");
  const [invitation] = inserted;
  return {
    invited: true as const,
    invitation: {
      id: invitation.id,
      projectId,
      email: invitation.email,
      role: invitation.role,
      createdAt: invitation.createdAt,
    },
  };
}

export async function revokeInvitation(
  projectId: string,
  invitationId: string,
): Promise<{ error: string | undefined }> {
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

async function countAdmins(tx: Executor, projectId: string) {
  const admins = await tx
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

// Role changes and removals run under the project's lock (withProjectLock),
// each re-reading the caller's permission, the target and the admin count
// there: checked outside it, two admins stepping down at once would each see
// the other and leave the project with none.

export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: Role,
) {
  const session = await requireSession();
  if (!isRole(role)) return { error: "Unknown role" };

  const result = await withProjectLock(projectId, async (tx) => {
    await requireMembership(projectId, session.user.id, "admin", tx);
    const target = await getMembership(projectId, userId, tx);
    if (!target) return { error: "Not a member" };
    if (
      target.role === "admin" &&
      role !== "admin" &&
      (await countAdmins(tx, projectId)) <= 1
    ) {
      return { error: "A project needs at least one admin" };
    }
    await tx
      .update(projectMembers)
      .set({ role })
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      );
    return { error: undefined };
  });
  revalidatePath("/", "layout");
  return result;
}

export async function removeMember(projectId: string, userId: string) {
  const session = await requireSession();
  const isSelf = userId === session.user.id;

  const result = await withProjectLock(projectId, async (tx) => {
    await requireMembership(
      projectId,
      session.user.id,
      isSelf ? undefined : "admin",
      tx,
    );
    const target = await getMembership(projectId, userId, tx);
    if (!target) return { error: "Not a member" };
    if (target.role === "admin" && (await countAdmins(tx, projectId)) <= 1) {
      return { error: "A project needs at least one admin" };
    }

    await tx
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      );
    // They can no longer see the project's tasks (visibleTasksWhere), so
    // leaving them assigned would only show a name nobody can reach.
    await tx
      .delete(taskAssignees)
      .where(
        and(
          eq(taskAssignees.userId, userId),
          inArray(
            taskAssignees.taskId,
            tx
              .select({ id: tasks.id })
              .from(tasks)
              .where(eq(tasks.projectId, projectId)),
          ),
        ),
      );
    return { removedSelf: isSelf };
  });
  revalidatePath("/", "layout");
  return result;
}
