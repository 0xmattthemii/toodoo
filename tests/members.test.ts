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
  withSlowMembershipWrites,
} from "./harness";

describe("roles", () => {
  it.each([["invalid-role"], ["Admin"], ["owner"], [""], [null], [7], [undefined]])(
    "rejects %j without touching the membership",
    async (value) => {
      const admin = await createUser("Admin");
      const projectId = await createProject([[admin, "admin"]]);
      const result = await as(admin, () =>
        updateMemberRole(projectId, admin.id, value as unknown as Role),
      );
      expect(result).toEqual({ error: "Unknown role" });
      expect(await roleIn(projectId, admin)).toBe("admin");

      const invited = await as(admin, () =>
        inviteToProject(projectId, "someone@test.dev", value as unknown as Role),
      );
      // `undefined` falls back to the parameter's default, "member".
      if (value === undefined) expect(invited).toMatchObject({ invited: true });
      else expect(invited).toEqual({ error: "Unknown role" });
    },
  );

  it("is enforced by the database too", async () => {
    const admin = await createUser("Admin");
    const projectId = await createProject([[admin, "admin"]]);
    await expect(
      db.execute(sql`update project_members set role = 'owner' where project_id = ${projectId}`),
    ).rejects.toThrow();
  });

  it("keeps the last admin", async () => {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const projectId = await createProject([[admin, "admin"], [member, "member"]]);

    expect(await as(admin, () => updateMemberRole(projectId, admin.id, "member"))).toEqual({
      error: "A project needs at least one admin",
    });
    expect(await as(admin, () => removeMember(projectId, admin.id))).toEqual({
      error: "A project needs at least one admin",
    });
    expect(await adminCount(projectId)).toBe(1);

    // Promoting someone first frees the original admin to step down.
    expect(await as(admin, () => updateMemberRole(projectId, member.id, "admin"))).toEqual({
      error: undefined,
    });
    expect(await as(admin, () => updateMemberRole(projectId, admin.id, "member"))).toEqual({
      error: undefined,
    });
  });

  it("lets only admins change roles or remove others", async () => {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const projectId = await createProject([[admin, "admin"], [member, "member"]]);
    await expect(
      as(member, () => updateMemberRole(projectId, member.id, "admin")),
    ).rejects.toThrow("Only project admins can do this");
    await expect(as(member, () => removeMember(projectId, admin.id))).rejects.toThrow(
      "Only project admins can do this",
    );
    // Leaving is always allowed.
    expect(await as(member, () => removeMember(projectId, member.id))).toEqual({
      removedSelf: true,
    });
  });
});

// Two admins each checking "is there another admin?" at the same moment
// would both see one and both step down. Membership changes serialize on the
// project, so the second sees the first's change.
describe("concurrent admin changes", () => {
  const cases: [string, (a: string, b: string, p: string) => [() => Promise<unknown>, () => Promise<unknown>]][] = [
    ["demote / demote", (a, b, p) => [() => updateMemberRole(p, a, "member"), () => updateMemberRole(p, b, "member")]],
    ["leave / leave", (a, b, p) => [() => removeMember(p, a), () => removeMember(p, b)]],
    ["demote / remove", (a, b, p) => [() => updateMemberRole(p, a, "member"), () => removeMember(p, b)]],
  ];

  it.each(cases)("%s leaves exactly one admin", async (_, actions) => {
    const first = await createUser("First");
    const second = await createUser("Second");
    const projectId = await createProject([[first, "admin"], [second, "admin"]]);
    const [asFirst, asSecond] = actions(first.id, second.id, projectId);

    const results = await withSlowMembershipWrites(() =>
      Promise.all([as(first, asFirst), as(second, asSecond)]),
    );

    expect(await adminCount(projectId)).toBe(1);
    expect(results).toContainEqual({ error: "A project needs at least one admin" });
  });
});
