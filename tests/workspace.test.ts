import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { inviteToProject, updateMemberRole } from "@/actions/members";
import { createProject as createProjectAction } from "@/actions/projects";
import { createTask } from "@/actions/tasks";
import {
  deactivateWorkspaceMember,
  getWorkspaceAdminData,
  inviteToWorkspace,
  restoreWorkspaceMember,
  updateWorkspaceRole,
  updateWorkspaceSettings,
} from "@/actions/workspace";
import { db } from "@/db";
import { session, taskAssignees, user } from "@/db/schema";
import { acceptPendingInvitations } from "@/lib/data";
import { createProjectFor } from "@/lib/operations";
import {
  canCreateAccount,
  getWorkspaceSettings,
  joinWorkspaceOnSignUp,
} from "@/lib/workspace-access";

import {
  as,
  createProject,
  createTaskRow,
  createUser,
  roleIn,
  setSignupsEnabled,
  workspaceRoleOf,
  type TestUser,
} from "./harness";

const noAccess = "You don't have access to this workspace";

/** Gives `who` the address `email`, as a sign-up through an invitation would. */
async function giveAddress(who: TestUser, email: string) {
  await db.update(user).set({ email }).where(eq(user.id, who.id));
  return { ...who, email };
}

describe("joining the workspace", () => {
  it("makes the first account its owner, and later ones members", async () => {
    const first = await createUser("First", { workspaceRole: null });
    await joinWorkspaceOnSignUp(first.id);
    expect(await workspaceRoleOf(first)).toBe("owner");

    const second = await createUser("Second", { workspaceRole: null });
    await joinWorkspaceOnSignUp(second.id);
    expect(await workspaceRoleOf(second)).toBe("member");
  });

  it("with sign-ups closed, admits only invited addresses", async () => {
    const owner = await createUser("Owner", { workspaceRole: "owner" });
    await setSignupsEnabled(false);

    expect(await canCreateAccount("stranger@test.dev")).toBe(false);

    await as(owner, () => inviteToWorkspace("colleague@test.dev", "member"));
    expect(await canCreateAccount("Colleague@test.dev")).toBe(true);

    const projectId = await createProject([[owner, "admin"]]);
    await as(owner, () =>
      inviteToProject(projectId, "client@test.dev", "member"),
    );
    expect(await canCreateAccount("client@test.dev")).toBe(true);

    // An account let in by an invitation waits for it instead of joining.
    const colleague = await createUser("Colleague", { workspaceRole: null });
    await joinWorkspaceOnSignUp(colleague.id);
    expect(await workspaceRoleOf(colleague)).toBeNull();
  });

  it("lets anyone create the very first account, even with sign-ups closed", async () => {
    await setSignupsEnabled(false);
    expect(await canCreateAccount("founder@test.dev")).toBe(true);
  });

  it("keeps a signed-in account without a membership out of everything", async () => {
    const outsider = await createUser("Outsider", { workspaceRole: null });
    await expect(
      as(outsider, () => createTask({ title: "Sneaky" })),
    ).rejects.toThrow(noAccess);
  });
});

describe("workspace invitations", () => {
  it("are accepted in their role once the address is verified", async () => {
    const owner = await createUser("Owner", { workspaceRole: "owner" });
    expect(
      await as(owner, () => inviteToWorkspace("new-admin@test.dev", "admin")),
    ).toMatchObject({ invited: true });

    const invitee = await giveAddress(
      await createUser("Invitee", { verified: false, workspaceRole: null }),
      "new-admin@test.dev",
    );
    await acceptPendingInvitations(invitee.id);
    expect(await workspaceRoleOf(invitee)).toBeNull();

    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, invitee.id));
    await acceptPendingInvitations(invitee.id);
    expect(await workspaceRoleOf(invitee)).toBe("admin");
  });

  it("promote a verified guest straight away", async () => {
    const owner = await createUser("Owner", { workspaceRole: "owner" });
    const guest = await createUser("Guest", { workspaceRole: "guest" });
    expect(
      await as(owner, () => inviteToWorkspace(guest.email, "member")),
    ).toMatchObject({ added: true });
    expect(await workspaceRoleOf(guest)).toBe("member");
  });

  it("can only be sent by admins", async () => {
    const member = await createUser("Member");
    expect(
      await as(member, () => inviteToWorkspace("someone@test.dev", "member")),
    ).toEqual({ error: "Only workspace admins can do that" });
    expect(await as(member, () => getWorkspaceAdminData())).toEqual({
      error: "Only workspace admins can do that",
    });
  });
});

describe("guests", () => {
  async function guestInProject() {
    const owner = await createUser("Owner", { workspaceRole: "owner" });
    const projectId = await createProject([[owner, "admin"]]);
    await as(owner, () =>
      inviteToProject(projectId, "client@test.dev", "member"),
    );
    const client = await giveAddress(
      await createUser("Client", { workspaceRole: null }),
      "client@test.dev",
    );
    await acceptPendingInvitations(client.id);
    return { owner, projectId, client };
  }

  it("are what an outsider invited to a project becomes", async () => {
    const { projectId, client } = await guestInProject();
    expect(await workspaceRoleOf(client)).toBe("guest");
    expect(await roleIn(projectId, client)).toBe("member");
  });

  it("can't create projects", async () => {
    const { client } = await guestInProject();
    expect(
      await as(client, () => createProjectAction({ name: "Mine" })),
    ).toEqual({ error: "Guests can't create projects" });
    await expect(createProjectFor(client.id, { name: "Mine" })).rejects.toThrow(
      "Guests can't do that",
    );
  });

  it("can't administer a project", async () => {
    const { owner, projectId, client } = await guestInProject();
    expect(
      await as(owner, () => updateMemberRole(projectId, client.id, "admin")),
    ).toEqual({ error: "Guests can't be project admins" });
    expect(
      await as(owner, () =>
        inviteToProject(projectId, "other-client@test.dev", "admin"),
      ),
    ).toMatchObject({ error: expect.stringContaining("guests can't be project admins") });
  });

  it("keep a member's place when a member is invited to a project", async () => {
    const owner = await createUser("Owner", { workspaceRole: "owner" });
    const member = await createUser("Member");
    const projectId = await createProject([[owner, "admin"]]);
    await as(owner, () => inviteToProject(projectId, member.email, "admin"));
    expect(await workspaceRoleOf(member)).toBe("member");
    expect(await roleIn(projectId, member)).toBe("admin");
  });
});

describe("managing people", () => {
  it("hands a new guest's sole-admin projects to the admin making the change", async () => {
    const owner = await createUser("Owner", { workspaceRole: "owner" });
    const member = await createUser("Member");
    const solo = await createProject([[member, "admin"]]);
    const shared = await createProject([
      [member, "admin"],
      [owner, "admin"],
    ]);

    expect(
      await as(owner, () => updateWorkspaceRole(member.id, "guest")),
    ).toEqual({ error: undefined, handedOver: 1 });
    expect(await workspaceRoleOf(member)).toBe("guest");
    expect(await roleIn(solo, member)).toBe("member");
    expect(await roleIn(solo, owner)).toBe("admin");
    expect(await roleIn(shared, member)).toBe("member");
  });

  it("removes someone completely, and can bring them back", async () => {
    const owner = await createUser("Owner", { workspaceRole: "owner" });
    const member = await createUser("Member");
    const projectId = await createProject([[member, "admin"]]);
    await createTaskRow(owner, { projectId, assignees: [member] });
    const now = new Date();
    await db.insert(session).values({
      id: "session-member",
      token: "member-token",
      userId: member.id,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    });

    expect(
      await as(owner, () => deactivateWorkspaceMember(member.id)),
    ).toEqual({ error: undefined, handedOver: 1 });
    expect(await workspaceRoleOf(member)).toBe("removed");
    expect(await roleIn(projectId, member)).toBeNull();
    expect(await roleIn(projectId, owner)).toBe("admin");
    expect(
      await db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.userId, member.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(session).where(eq(session.userId, member.id)),
    ).toHaveLength(0);
    await expect(
      as(member, () => createTask({ title: "Still here?" })),
    ).rejects.toThrow(noAccess);

    // An old invitation doesn't bring them back; an admin does.
    await as(owner, () => inviteToProject(projectId, member.email, "member"));
    await acceptPendingInvitations(member.id);
    expect(await workspaceRoleOf(member)).toBe("removed");

    await as(owner, () => restoreWorkspaceMember(member.id));
    expect(await workspaceRoleOf(member)).toBe("member");
  });

  it("never touches the owner, and nobody changes their own access", async () => {
    const owner = await createUser("Owner", { workspaceRole: "owner" });
    const admin = await createUser("Admin", { workspaceRole: "admin" });
    expect(
      await as(admin, () => updateWorkspaceRole(owner.id, "member")),
    ).toEqual({ error: "The owner can't be changed" });
    expect(await as(admin, () => deactivateWorkspaceMember(owner.id))).toEqual({
      error: "The owner can't be changed",
    });
    expect(
      await as(admin, () => updateWorkspaceRole(admin.id, "member")),
    ).toMatchObject({ error: expect.stringContaining("your own access") });
  });

  it("lets only admins change the sign-up setting", async () => {
    const admin = await createUser("Admin", { workspaceRole: "admin" });
    const member = await createUser("Member");
    expect(
      await as(member, () => updateWorkspaceSettings({ signupsEnabled: false })),
    ).toEqual({ error: "Only workspace admins can do that" });
    await as(admin, () => updateWorkspaceSettings({ signupsEnabled: false }));
    expect(await getWorkspaceSettings()).toEqual({ signupsEnabled: false });
  });
});
