import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { removeMember } from "@/actions/members";
import {
  createTask,
  deleteTask,
  moveTaskToProject,
  reorderTasks,
  setTaskDone,
  updateTask,
} from "@/actions/tasks";
import { db } from "@/db";
import { taskAssignees, tasks } from "@/db/schema";
import { canAccessTask, getVisibleTasks } from "@/lib/data";
import { createTaskFor, deleteTaskFor, updateTaskFor } from "@/lib/operations";

import {
  as,
  createProject,
  createTaskRow,
  createUser,
  type TestUser,
} from "./harness";

const notFound = { error: "Task not found" };

async function assigneesOf(taskId: string) {
  const rows = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId));
  return rows.map((row) => row.userId).sort();
}

async function visibleIds(who: TestUser) {
  return (await getVisibleTasks(who.id)).map((task) => task.id).sort();
}

/** Every way to change a task, through the web app and through MCP. */
async function expectLockedOut(who: TestUser, taskId: string) {
  expect(await canAccessTask(taskId, who.id)).toBeNull();
  expect(await as(who, () => setTaskDone(taskId, true))).toEqual(notFound);
  expect(
    await as(who, () => updateTask(taskId, { title: "Mine now" })),
  ).toEqual(notFound);
  expect(await as(who, () => moveTaskToProject(taskId, null))).toEqual(
    notFound,
  );
  expect(await as(who, () => deleteTask(taskId))).toEqual(notFound);
  await expect(updateTaskFor(who.id, taskId, { done: true })).rejects.toThrow(
    "Task not found",
  );
  await expect(deleteTaskFor(who.id, taskId)).rejects.toThrow("Task not found");
}

// A project's tasks belong to the project: its current members, and nobody
// else, may see or change them — including whoever created one or is
// assigned to it.
describe("project tasks", () => {
  it("are out of reach of an assignee who isn't a member", async () => {
    const admin = await createUser("Admin");
    const outsider = await createUser("Outsider");
    const projectId = await createProject([[admin, "admin"]]);
    // An assignment the rules no longer allow, as older data may hold.
    const taskId = await createTaskRow(admin, {
      projectId,
      assignees: [outsider],
    });

    expect(await visibleIds(outsider)).toEqual([]);
    await expectLockedOut(outsider, taskId);
    expect(await db.select().from(tasks)).toEqual([
      expect.objectContaining({
        id: taskId,
        title: "Task",
        done: false,
        projectId,
      }),
    ]);
  });

  it("are out of reach of their creator once removed from the project", async () => {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const projectId = await createProject([
      [admin, "admin"],
      [member, "member"],
    ]);
    const authored = await createTaskRow(member, { projectId });
    const assigned = await createTaskRow(admin, {
      projectId,
      assignees: [member],
    });
    expect(await visibleIds(member)).toEqual([authored, assigned].sort());

    await as(admin, () => removeMember(projectId, member.id));

    expect(await visibleIds(member)).toEqual([]);
    await expectLockedOut(member, authored);
    await expectLockedOut(member, assigned);
    expect(await as(member, () => reorderTasks([authored, assigned]))).toEqual(
      notFound,
    );
    // Removal also unassigns them: nobody can reach a name they can't see.
    expect(await assigneesOf(assigned)).toEqual([]);
  });
});

describe("tasks outside any project", () => {
  it("belong to their creator and assignees", async () => {
    const me = await createUser("Me");
    const assignee = await createUser("Assignee");
    const stranger = await createUser("Stranger");
    const taskId = await createTaskRow(me, { assignees: [assignee] });

    expect(await canAccessTask(taskId, me.id)).not.toBeNull();
    expect(await canAccessTask(taskId, assignee.id)).not.toBeNull();
    await expectLockedOut(stranger, taskId);
  });
});

describe("assignees", () => {
  async function projectWithOutsider() {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const outsider = await createUser("Outsider");
    const projectId = await createProject([
      [admin, "admin"],
      [member, "member"],
    ]);
    return { admin, member, outsider, projectId };
  }

  const notInProject = "Tasks can only be assigned to members of their project";
  const noSharedProject =
    "Tasks can only be assigned to people you share a project with";

  it("of a project task must be members of the project", async () => {
    const { admin, member, outsider, projectId } = await projectWithOutsider();

    expect(
      await as(admin, () =>
        createTask({ title: "x", projectId, assigneeIds: [outsider.id] }),
      ),
    ).toEqual({
      error: notInProject,
    });
    await expect(
      createTaskFor(admin.id, {
        title: "x",
        projectId,
        assigneeIds: [outsider.id],
      }),
    ).rejects.toThrow(notInProject);
    expect(await db.select().from(tasks)).toHaveLength(0);

    const created = await as(admin, () =>
      createTask({ title: "x", projectId, assigneeIds: [member.id, admin.id] }),
    );
    expect(created.taskId).toEqual(expect.any(String));
  });

  it("can't be changed to someone outside the project", async () => {
    const { admin, member, outsider, projectId } = await projectWithOutsider();
    const taskId = await createTaskRow(admin, {
      projectId,
      assignees: [member],
    });

    expect(
      await as(admin, () =>
        updateTask(taskId, {
          title: "Task",
          projectId,
          assigneeIds: [outsider.id],
        }),
      ),
    ).toEqual({
      error: notInProject,
    });
    await expect(
      updateTaskFor(admin.id, taskId, { assigneeIds: [outsider.id] }),
    ).rejects.toThrow(notInProject);
    expect(await assigneesOf(taskId)).toEqual([member.id]);
  });

  it("can't come along into a project they aren't in", async () => {
    const { admin, member, projectId } = await projectWithOutsider();
    const other = await createProject([[admin, "admin"]]);
    const taskId = await createTaskRow(admin, {
      projectId,
      assignees: [member],
    });

    expect(
      await as(admin, () =>
        updateTask(taskId, {
          title: "Task",
          projectId: other,
          assigneeIds: [member.id],
        }),
      ),
    ).toEqual({ error: notInProject });
    await expect(
      updateTaskFor(admin.id, taskId, {
        projectId: other,
        assigneeIds: [member.id],
      }),
    ).rejects.toThrow(notInProject);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(task.projectId).toBe(projectId);
  });

  it("outside a project, must share a project with you (or be you)", async () => {
    const { admin, member, outsider } = await projectWithOutsider();

    expect(
      await as(admin, () =>
        createTask({ title: "x", assigneeIds: [outsider.id] }),
      ),
    ).toEqual({
      error: noSharedProject,
    });
    const taskId = await createTaskRow(admin, { assignees: [member] });
    expect(
      await as(admin, () =>
        updateTask(taskId, { title: "Task", assigneeIds: [outsider.id] }),
      ),
    ).toEqual({
      error: noSharedProject,
    });
    await expect(
      updateTaskFor(admin.id, taskId, { assigneeIds: [outsider.id] }),
    ).rejects.toThrow(noSharedProject);

    const created = await as(admin, () =>
      createTask({ title: "x", assigneeIds: [admin.id, member.id] }),
    );
    expect(created.taskId).toEqual(expect.any(String));
  });

  it("already on a task outside any project may stay on it", async () => {
    const me = await createUser("Me");
    const former = await createUser("Former colleague");
    const taskId = await createTaskRow(me, { assignees: [former] });

    expect(
      await as(me, () =>
        updateTask(taskId, { title: "Renamed", assigneeIds: [former.id] }),
      ),
    ).toEqual({
      error: undefined,
    });
    expect(await assigneesOf(taskId)).toEqual([former.id]);
  });

  it.each([
    ["not a list", "user-1" as unknown as string[]],
    ["not strings", [7] as unknown as string[]],
    ["too many", Array.from({ length: 101 }, (_, i) => `user-${i}`)],
  ])("are refused when %s", async (_, assigneeIds) => {
    const me = await createUser("Me");
    expect(await as(me, () => createTask({ title: "x", assigneeIds }))).toEqual(
      { error: "Invalid assignees" },
    );
  });

  describe("who aren't in the project a task moves into", () => {
    async function taskInA() {
      const me = await createUser("Me");
      const inBoth = await createUser("In both");
      const onlyA = await createUser("Only in A");
      const projectA = await createProject([
        [me, "admin"],
        [inBoth, "member"],
        [onlyA, "member"],
      ]);
      const projectB = await createProject([
        [me, "admin"],
        [inBoth, "member"],
      ]);
      const taskId = await createTaskRow(me, {
        projectId: projectA,
        assignees: [inBoth, onlyA],
      });
      return { me, inBoth, projectB, taskId };
    }

    it("are unassigned when it is dragged there", async () => {
      const { me, inBoth, projectB, taskId } = await taskInA();
      expect(await as(me, () => moveTaskToProject(taskId, projectB))).toEqual({
        error: undefined,
      });
      expect(await assigneesOf(taskId)).toEqual([inBoth.id]);
    });

    it("are unassigned when it is edited there without naming assignees", async () => {
      const { me, inBoth, projectB, taskId } = await taskInA();
      expect(
        await as(me, () =>
          updateTask(taskId, { title: "Task", projectId: projectB }),
        ),
      ).toEqual({
        error: undefined,
      });
      expect(await assigneesOf(taskId)).toEqual([inBoth.id]);
    });

    it("are unassigned when it is moved there over MCP", async () => {
      const { me, inBoth, projectB, taskId } = await taskInA();
      await updateTaskFor(me.id, taskId, { projectId: projectB });
      expect(await assigneesOf(taskId)).toEqual([inBoth.id]);
    });
  });
});

describe("malformed ids", () => {
  it("are simply not found", async () => {
    const me = await createUser("Me");
    for (const id of ["not-a-uuid", "", "1; drop table tasks"]) {
      expect(await as(me, () => setTaskDone(id, true))).toEqual(notFound);
      expect(await as(me, () => deleteTask(id))).toEqual(notFound);
      expect(await as(me, () => reorderTasks([id, "also-bad"]))).toEqual(
        notFound,
      );
    }
    await expect(
      as(me, () => createTask({ title: "x", projectId: "not-a-uuid" })),
    ).rejects.toThrow("You are not a member of this project");
  });
});

describe("deadlines", () => {
  async function deadlineOf(taskId: string) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    return task.deadline;
  }

  it("are stored as the calendar day given", async () => {
    const me = await createUser("Me");
    const created = await as(me, () =>
      createTask({ title: "x", deadline: "2026-09-24" }),
    );
    if (!created.taskId) throw new Error("not created");
    expect(await deadlineOf(created.taskId)).toBe("2026-09-24");

    // An API caller's timestamp keeps the day it was written in.
    const task = await createTaskFor(me.id, {
      title: "y",
      deadline: "2026-09-15T23:30:00-07:00",
    });
    expect(task.deadline).toBe("2026-09-15");
    await updateTaskFor(me.id, task.id, { deadline: null });
    expect(await deadlineOf(task.id)).toBeNull();
  });

  it.each(["2026-02-30", "tomorrow", "09/24/2026"])(
    "refuse %j, which isn't a day",
    async (deadline) => {
      const me = await createUser("Me");
      expect(await as(me, () => createTask({ title: "x", deadline }))).toEqual({
        error: "Invalid deadline",
      });
      await expect(
        createTaskFor(me.id, { title: "x", deadline }),
      ).rejects.toThrow("Deadline must be a date");
      expect(await db.select().from(tasks)).toHaveLength(0);
    },
  );
});
