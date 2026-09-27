import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  inviteToProject,
  removeMember,
  updateMemberRole,
} from "@/actions/members";
import { db } from "@/db";
import type { Role } from "@/lib/types";

import {
  adminCount,
  as,
  createProject,
  createUser,
  roleIn,
  untilMembershipWriteHeld,
  withSlowMembershipWrites,
} from "./harness";

// Anything a request can send in place of a role.
const NOT_ROLES = [
  "invalid-role",
  "Admin",
  "owner",
  "",
  null,
  7,
  {},
] as unknown as Role[];

describe("roles", () => {
  it.each(NOT_ROLES)(
    "updateMemberRole refuses %j without touching the membership",
    async (role) => {
      const admin = await createUser("Admin");
      const projectId = await createProject([[admin, "admin"]]);
      expect(
        await as(admin, () => updateMemberRole(projectId, admin.id, role)),
      ).toEqual({
        error: "Unknown role",
      });
      expect(await roleIn(projectId, admin)).toBe("admin");
    },
  );

  it.each(NOT_ROLES)("inviteToProject refuses %j", async (role) => {
    const admin = await createUser("Admin");
    const projectId = await createProject([[admin, "admin"]]);
    expect(
      await as(admin, () =>
        inviteToProject(projectId, "someone@test.dev", role),
      ),
    ).toEqual({
      error: "Unknown role",
    });
  });

  it.each([
    [
      "project_members_role_check",
      sql`update project_members set role = 'owner'`,
    ],
    [
      "project_invitations_role_check",
      sql`update project_invitations set role = 'owner'`,
    ],
    [
      "project_invitations_status_check",
      sql`update project_invitations set status = 'declined'`,
    ],
  ])("are also enforced by Postgres (%s)", async (constraint, statement) => {
    const admin = await createUser("Admin");
    const projectId = await createProject([[admin, "admin"]]);
    await as(admin, () =>
      inviteToProject(projectId, "someone@test.dev", "member"),
    );
    await expect(db.execute(statement)).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint }),
    });
  });
});

describe("the last admin", () => {
  it("can neither step down nor leave", async () => {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const projectId = await createProject([
      [admin, "admin"],
      [member, "member"],
    ]);
    const needsAdmin = { error: "A project needs at least one admin" };

    expect(
      await as(admin, () => updateMemberRole(projectId, admin.id, "member")),
    ).toEqual(needsAdmin);
    expect(await as(admin, () => removeMember(projectId, admin.id))).toEqual(
      needsAdmin,
    );
    expect(await adminCount(projectId)).toBe(1);
  });

  it("can once someone else is an admin", async () => {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const projectId = await createProject([
      [admin, "admin"],
      [member, "member"],
    ]);

    await as(admin, () => updateMemberRole(projectId, member.id, "admin"));
    expect(
      await as(admin, () => updateMemberRole(projectId, admin.id, "member")),
    ).toEqual({
      error: undefined,
    });
    expect(await roleIn(projectId, member)).toBe("admin");
  });
});

describe("permissions", () => {
  it("only admins change roles or remove others; anyone may leave", async () => {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const projectId = await createProject([
      [admin, "admin"],
      [member, "member"],
    ]);

    await expect(
      as(member, () => updateMemberRole(projectId, member.id, "admin")),
    ).rejects.toThrow("Only project admins can do this");
    await expect(
      as(member, () => removeMember(projectId, admin.id)),
    ).rejects.toThrow("Only project admins can do this");
    expect(await as(member, () => removeMember(projectId, member.id))).toEqual({
      removedSelf: true,
    });
  });

  it("an admin demoted while their request waits can no longer act as one", async () => {
    const first = await createUser("First");
    const second = await createUser("Second");
    const member = await createUser("Member");
    const projectId = await createProject([
      [first, "admin"],
      [second, "admin"],
      [member, "member"],
    ]);

    // Second demotes First; First's removal of Member queues behind it and
    // must see First as the member they now are.
    const [, removal] = await withSlowMembershipWrites(async () => {
      const demotion = as(second, () =>
        updateMemberRole(projectId, first.id, "member"),
      );
      await untilMembershipWriteHeld();
      const removal = as(first, () => removeMember(projectId, member.id));
      return Promise.allSettled([demotion, removal]);
    });
    expect(removal).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        message: "Only project admins can do this",
      }),
    });
    expect(await roleIn(projectId, member)).toBe("member");
  });
});

// Two admins each checking "is there another admin?" at the same moment would
// both see one and both step down. Membership changes serialize on the
// project, so the second sees the first's change.
describe("concurrent admin changes", () => {
  type Change = (
    projectId: string,
    first: string,
    second: string,
  ) => [() => Promise<unknown>, () => Promise<unknown>];
  const cases: [string, Change][] = [
    [
      "demote / demote",
      (p, a, b) => [
        () => updateMemberRole(p, a, "member"),
        () => updateMemberRole(p, b, "member"),
      ],
    ],
    [
      "leave / leave",
      (p, a, b) => [() => removeMember(p, a), () => removeMember(p, b)],
    ],
    [
      "demote / remove",
      (p, a, b) => [
        () => updateMemberRole(p, a, "member"),
        () => removeMember(p, b),
      ],
    ],
  ];

  it.each(cases)("%s leaves exactly one admin", async (_, change) => {
    const first = await createUser("First");
    const second = await createUser("Second");
    const projectId = await createProject([
      [first, "admin"],
      [second, "admin"],
    ]);
    const [byFirst, bySecond] = change(projectId, first.id, second.id);

    const results = await withSlowMembershipWrites(() =>
      Promise.all([as(first, byFirst), as(second, bySecond)]),
    );
    expect(await adminCount(projectId)).toBe(1);
    expect(results).toContainEqual({
      error: "A project needs at least one admin",
    });
  });
});
