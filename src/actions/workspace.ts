"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  projectMembers,
  projects,
  session as sessions,
  taskAssignees,
  user,
  workspaceInvitations,
  workspaceMembers,
  workspaceSettings,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { allowedEmailDomains, isEmailDomainAllowed } from "@/lib/auth-flags";
import { nextProjectMemberPosition, type Executor } from "@/lib/data";
import { appUrl, sendEmail } from "@/lib/email";
import { requireSession } from "@/lib/session";
import {
  isAssignableWorkspaceRole,
  managesWorkspace,
  type AssignableWorkspaceRole,
  type Person,
  type WorkspaceRole,
} from "@/lib/types";
import { formatEmailDomains } from "@/lib/utils";
import {
  getWorkspaceMember,
  getWorkspaceRole,
  getWorkspaceSettings,
  withWorkspaceLock,
  type WorkspaceSettings,
} from "@/lib/workspace-access";

// Running the workspace: its people, invitations and settings. Owners and
// admins only — every action here checks that first. See
// lib/workspace-access.ts for what the roles mean.

export type WorkspacePerson = Person & {
  role: WorkspaceRole;
  /** Removed by an admin: no access until restored. */
  deactivated: boolean;
  /** Whether they have confirmed their address. */
  verified: boolean;
  joinedAt: Date;
};

export type WorkspaceInvite = {
  id: string;
  email: string;
  role: "admin" | "member";
  createdAt: Date;
};

export type WorkspaceAdminData = {
  people: WorkspacePerson[];
  invitations: WorkspaceInvite[];
  settings: WorkspaceSettings;
  /** The deployment's email-domain lock (AUTH_ALLOWED_EMAIL_DOMAINS), if any. */
  allowedDomains: string[];
};

/** The signed-in admin's id, or null when they don't run the workspace. */
async function requireWorkspaceAdmin() {
  const { user: me } = await requireSession();
  return managesWorkspace(await getWorkspaceRole(me.id)) ? me : null;
}

const notAdmin = { error: "Only workspace admins can do that" } as const;

export async function getWorkspaceAdminData(): Promise<
  { data: WorkspaceAdminData } | { error: string }
> {
  if (!(await requireWorkspaceAdmin())) return notAdmin;
  const [people, invitations, settings] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        verified: user.emailVerified,
        role: workspaceMembers.role,
        deactivatedAt: workspaceMembers.deactivatedAt,
        joinedAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(user, eq(user.id, workspaceMembers.userId))
      .orderBy(asc(user.name)),
    db
      .select({
        id: workspaceInvitations.id,
        email: workspaceInvitations.email,
        role: workspaceInvitations.role,
        createdAt: workspaceInvitations.createdAt,
      })
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.status, "pending"))
      .orderBy(asc(workspaceInvitations.createdAt)),
    getWorkspaceSettings(),
  ]);
  return {
    data: {
      people: people.map(({ deactivatedAt, ...person }) => ({
        ...person,
        deactivated: deactivatedAt !== null,
      })),
      invitations,
      settings,
      allowedDomains: allowedEmailDomains(),
    },
  };
}

/** Sends one email, reporting whether it went out; the change it announces is saved either way. */
async function trySend(what: string, send: () => Promise<unknown>) {
  try {
    await send();
    return true;
  } catch (error) {
    console.error(`[email] could not send the ${what}`, error);
    return false;
  }
}

/**
 * Invites someone to the workspace as an admin or a member. An account that
 * has confirmed its address joins (or, from guest, is promoted) right away;
 * anyone else gets an invitation, which lets them sign up even with sign-ups
 * closed and is accepted once their address is verified.
 */
export async function inviteToWorkspace(
  email: string,
  role: "admin" | "member",
) {
  const me = await requireWorkspaceAdmin();
  if (!me) return notAdmin;
  if (role !== "admin" && role !== "member") return { error: "Unknown role" };

  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return { error: "Enter a valid email address" };
  }
  if (!isEmailDomainAllowed(address)) {
    return {
      error: `This instance only allows ${formatEmailDomains(allowedEmailDomains())} accounts`,
    };
  }

  const [existing] = await db
    .select({ id: user.id, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, address));
  const membership = existing ? await getWorkspaceMember(existing.id) : null;
  if (membership?.deactivatedAt) {
    return { error: "That person was removed. Restore them from the list instead." };
  }
  if (membership && membership.role !== "guest") {
    return { error: "That person is already in the workspace" };
  }

  if (existing?.emailVerified) {
    // A guest is promoted; an account with no place at all joins.
    await db
      .insert(workspaceMembers)
      .values({ userId: existing.id, role })
      .onConflictDoUpdate({ target: workspaceMembers.userId, set: { role } });
    const emailSent = await trySend("workspace email", () =>
      sendEmail({
        to: address,
        subject: `${me.name} added you to the workspace on toodoo`,
        heading: "You've joined the workspace",
        body: `${me.name} made you ${role === "admin" ? "an admin" : "a member"} of the toodoo workspace. You can now create projects and be added to any of them.`,
        actionLabel: "Open toodoo",
        actionUrl: appUrl("/"),
      }),
    );
    revalidatePath("/", "layout");
    return { added: true as const, emailSent };
  }

  const [invitation] = await db
    .insert(workspaceInvitations)
    .values({ email: address, role, invitedBy: me.id })
    .onConflictDoNothing()
    .returning();
  if (!invitation) return { error: "That email has already been invited" };

  // An existing account's sign-up link has most likely expired; send a fresh one.
  const verificationSent =
    !existing ||
    (await trySend("verification email", () =>
      auth.api.sendVerificationEmail({
        body: { email: address, callbackURL: "/" },
      }),
    ));
  const invitationSent = await trySend("workspace invitation", () =>
    sendEmail({
      to: address,
      subject: `${me.name} invited you to toodoo`,
      heading: `Join ${me.name} on toodoo`,
      body: existing
        ? `${me.name} invited you to their toodoo workspace. Confirm your email address with the verification link we've just sent you, and you'll join automatically.`
        : `${me.name} invited you to their toodoo workspace. Create an account with this email address and confirm it, and you'll join automatically.`,
      actionLabel: existing ? "Open toodoo" : "Sign up",
      actionUrl: appUrl(existing ? "/" : "/signup"),
    }),
  );
  revalidatePath("/", "layout");
  return {
    invited: true as const,
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      createdAt: invitation.createdAt,
    },
    emailSent: verificationSent && invitationSent,
  };
}

export async function revokeWorkspaceInvitation(invitationId: string) {
  if (!(await requireWorkspaceAdmin())) return notAdmin;
  await db
    .delete(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.status, "pending"),
      ),
    );
  revalidatePath("/", "layout");
  return { error: undefined };
}

/**
 * Before someone stops administering projects — on becoming a guest, or on
 * being removed — every project they were the only admin of is handed to
 * `actorId`, the admin making the change, so no project is left without one.
 * Returns how many were handed over.
 */
async function handOverProjects(
  tx: Executor,
  targetId: string,
  actorId: string,
) {
  const adminOf = await tx
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.userId, targetId), eq(projectMembers.role, "admin")),
    )
    .orderBy(asc(projectMembers.projectId));
  let handed = 0;
  for (const { projectId } of adminOf) {
    // Same lock as every membership change of the project (withProjectLock),
    // taken in id order so two hand-overs can't deadlock.
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    const others = await tx
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.role, "admin"),
          ne(projectMembers.userId, targetId),
        ),
      )
      .limit(1);
    if (others.length > 0) continue;
    await tx
      .insert(projectMembers)
      .values({
        projectId,
        userId: actorId,
        role: "admin",
        position: nextProjectMemberPosition(actorId),
      })
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role: "admin" },
      });
    handed += 1;
  }
  return handed;
}

/** The person an admin may manage: anyone but the owner and themselves. */
async function manageable(tx: Executor, meId: string, userId: string) {
  if (userId === meId) {
    return { error: "You can't change your own access. Ask another admin." };
  }
  const target = await getWorkspaceMember(userId, tx);
  if (!target) return { error: "Not in the workspace" };
  if (target.role === "owner") return { error: "The owner can't be changed" };
  return { target };
}

export async function updateWorkspaceRole(
  userId: string,
  role: AssignableWorkspaceRole,
) {
  const me = await requireWorkspaceAdmin();
  if (!me) return notAdmin;
  if (!isAssignableWorkspaceRole(role)) return { error: "Unknown role" };

  const result = await withWorkspaceLock(async (tx) => {
    const found = await manageable(tx, me.id, userId);
    if ("error" in found) return found;
    if (found.target.deactivatedAt) {
      return { error: "Restore them before changing their role" };
    }
    let handedOver = 0;
    if (role === "guest") {
      // Guests don't administer projects; they stay in them as members.
      handedOver = await handOverProjects(tx, userId, me.id);
      await tx
        .update(projectMembers)
        .set({ role: "member" })
        .where(eq(projectMembers.userId, userId));
    }
    await tx
      .update(workspaceMembers)
      .set({ role })
      .where(eq(workspaceMembers.userId, userId));
    return { error: undefined, handedOver };
  });
  revalidatePath("/", "layout");
  return result;
}

/**
 * Removes someone from the workspace: they lose access at once (their
 * sessions end), leave every project and every assignment, and their tasks
 * stay where they are. Projects only they administered are handed to the
 * admin removing them. An admin can restore them later.
 */
export async function deactivateWorkspaceMember(userId: string) {
  const me = await requireWorkspaceAdmin();
  if (!me) return notAdmin;

  const result = await withWorkspaceLock(async (tx) => {
    const found = await manageable(tx, me.id, userId);
    if ("error" in found) return found;
    if (found.target.deactivatedAt) return { error: undefined, handedOver: 0 };

    const handedOver = await handOverProjects(tx, userId, me.id);
    await tx.delete(projectMembers).where(eq(projectMembers.userId, userId));
    await tx.delete(taskAssignees).where(eq(taskAssignees.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx
      .update(workspaceMembers)
      .set({ deactivatedAt: new Date() })
      .where(eq(workspaceMembers.userId, userId));
    return { error: undefined, handedOver };
  });
  revalidatePath("/", "layout");
  return result;
}

/** Gives a removed person their access back, in the role they had. Projects they left aren't rejoined. */
export async function restoreWorkspaceMember(userId: string) {
  const me = await requireWorkspaceAdmin();
  if (!me) return notAdmin;
  await db
    .update(workspaceMembers)
    .set({ deactivatedAt: null })
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        inArray(workspaceMembers.role, ["admin", "member", "guest"]),
      ),
    );
  revalidatePath("/", "layout");
  return { error: undefined };
}

export async function updateWorkspaceSettings(input: {
  signupsEnabled: boolean;
}) {
  if (!(await requireWorkspaceAdmin())) return notAdmin;
  if (typeof input.signupsEnabled !== "boolean") {
    return { error: "Invalid settings" };
  }
  await db
    .insert(workspaceSettings)
    .values({ id: 1, signupsEnabled: input.signupsEnabled })
    .onConflictDoUpdate({
      target: workspaceSettings.id,
      set: { signupsEnabled: input.signupsEnabled, updatedAt: new Date() },
    });
  revalidatePath("/", "layout");
  return { error: undefined };
}
