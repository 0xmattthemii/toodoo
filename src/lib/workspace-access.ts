import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  projectInvitations,
  workspaceInvitations,
  workspaceMembers,
  workspaceSettings,
} from "@/db/schema";
import type { Executor } from "@/lib/data";
import type { WorkspaceRole } from "@/lib/types";

/**
 * The workspace is the deployment: one set of people, roles and settings.
 *
 * - The first account ever created becomes its **owner**, and there is only
 *   ever one.
 * - **Admins** (and the owner) run it: people, invitations, settings.
 * - **Members** are everyday users.
 * - **Guests** are outsiders invited to a project: they see only the
 *   projects they are in and can't create any.
 *
 * An account without an active membership can sign in but sees nothing: it
 * was removed, or it was invited and its address isn't verified yet. Every
 * server action checks this through `requireSession`, the MCP endpoint
 * through `requireWorkspaceRole`.
 */

/** Refused for lack of a workspace role; the message is shown as is. */
export class WorkspaceAccessError extends Error {}

export type WorkspaceMembership = {
  role: WorkspaceRole;
  deactivatedAt: Date | null;
};

export async function getWorkspaceMember(
  userId: string,
  tx: Executor = db,
): Promise<WorkspaceMembership | null> {
  const [row] = await tx
    .select({
      role: workspaceMembers.role,
      deactivatedAt: workspaceMembers.deactivatedAt,
    })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
  return row ?? null;
}

/** The user's role, or null when they have none or were removed. */
export async function getWorkspaceRole(
  userId: string,
  tx: Executor = db,
): Promise<WorkspaceRole | null> {
  const membership = await getWorkspaceMember(userId, tx);
  return membership && !membership.deactivatedAt ? membership.role : null;
}

const RANK: Record<WorkspaceRole, number> = {
  guest: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/** Whether `role` is at least `floor`. */
export function atLeast(role: WorkspaceRole, floor: WorkspaceRole) {
  return RANK[role] >= RANK[floor];
}

/**
 * The user's role, provided it is at least `floor`; otherwise throws a
 * WorkspaceAccessError saying why.
 */
export async function requireWorkspaceRole(
  userId: string,
  floor: WorkspaceRole = "guest",
  tx: Executor = db,
): Promise<WorkspaceRole> {
  const role = await getWorkspaceRole(userId, tx);
  if (!role) {
    throw new WorkspaceAccessError("You don't have access to this workspace");
  }
  if (!atLeast(role, floor)) {
    throw new WorkspaceAccessError(
      floor === "member"
        ? "Guests can't do that"
        : "Only workspace admins can do that",
    );
  }
  return role;
}

/**
 * Runs `fn` in a transaction holding the workspace's membership lock, so
 * checks like "is this the owner" or "who is left to administer this project"
 * and the writes that rely on them can't interleave with another request's.
 */
export async function withWorkspaceLock<T>(
  fn: (tx: Executor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('toodoo:workspace_members'))`,
    );
    return fn(tx);
  });
}

export type WorkspaceSettings = { signupsEnabled: boolean };

export async function getWorkspaceSettings(
  tx: Executor = db,
): Promise<WorkspaceSettings> {
  const [row] = await tx
    .select({ signupsEnabled: workspaceSettings.signupsEnabled })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.id, 1));
  // The migration creates the row; without one, sign-ups stay open as they
  // always were.
  return row ?? { signupsEnabled: true };
}

/** Whether an invitation — to the workspace or to a project — awaits `email`. */
export async function hasPendingInvitation(email: string) {
  const address = email.trim().toLowerCase();
  const [toWorkspace] = await db
    .select({ id: workspaceInvitations.id })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.email, address),
        eq(workspaceInvitations.status, "pending"),
      ),
    )
    .limit(1);
  if (toWorkspace) return true;
  const [toProject] = await db
    .select({ id: projectInvitations.id })
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.email, address),
        eq(projectInvitations.status, "pending"),
      ),
    )
    .limit(1);
  return Boolean(toProject);
}

async function isEmpty(tx: Executor = db) {
  const [anyone] = await tx
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .limit(1);
  return !anyone;
}

/**
 * Whether a new account may be created for `email`. With sign-ups on, anyone
 * may (the email-domain lock is checked separately, in auth.ts); with them
 * off, only someone an invitation awaits — the very first account excepted,
 * since an empty workspace has nobody to invite anyone.
 */
export async function canCreateAccount(email: string) {
  const { signupsEnabled } = await getWorkspaceSettings();
  if (signupsEnabled || (await isEmpty())) return true;
  return hasPendingInvitation(email);
}

/**
 * Gives a new account its place in the workspace: owner if it is the first
 * one, member while sign-ups are open. Otherwise an invitation let it in, and
 * it joins in that invitation's role once its address is verified
 * (acceptPendingInvitations).
 *
 * Someone who signs up because a project invited them is an outsider brought
 * in for that project, whatever the sign-up setting: they wait for the
 * invitation, which makes them a guest, rather than joining as a member.
 */
export async function joinWorkspaceOnSignUp(userId: string, email: string) {
  await withWorkspaceLock(async (tx) => {
    if (await isEmpty(tx)) {
      await tx
        .insert(workspaceMembers)
        .values({ userId, role: "owner" })
        .onConflictDoNothing();
      return;
    }
    const { signupsEnabled } = await getWorkspaceSettings(tx);
    if (!signupsEnabled) return;
    if (await invitedToProjectOnly(email, tx)) return;
    await tx
      .insert(workspaceMembers)
      .values({ userId, role: "member" })
      .onConflictDoNothing();
  });
}

/** A project invitation awaits `email`, and no workspace invitation does. */
async function invitedToProjectOnly(email: string, tx: Executor) {
  const address = email.trim().toLowerCase();
  const [toWorkspace] = await tx
    .select({ id: workspaceInvitations.id })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.email, address),
        eq(workspaceInvitations.status, "pending"),
      ),
    )
    .limit(1);
  if (toWorkspace) return false;
  const [toProject] = await tx
    .select({ id: projectInvitations.id })
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.email, address),
        eq(projectInvitations.status, "pending"),
      ),
    )
    .limit(1);
  return Boolean(toProject);
}
