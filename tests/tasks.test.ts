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

import { as, createProject, createTaskRow, createUser, type TestUser } from "./harness";

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

// A project's tasks belong to the project: its current members, and nobody
// else, may see or change them — including whoever created one or was
// assigned to it before leaving.
describe("removing a member", () => {
  async function removedMemberWithTasks() {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const projectId = await createProject([[admin, "admin"], [member, "member"]]);
    const authored = await createTaskRow(member, { projectId });
    const assigned = await createTaskRow(admin, { projectId, assignees: [member] });
    expect(await visibleIds(member)).toEqual([authored, assigned].sort());

    expect(await as(admin, () => removeMember(projectId, member.id))).toEqual({
      removedSelf: false,
    });
    return { admin, member, projectId, authored, assigned };
  }

  it("takes away every task of the project, authored or assigned", async () => {
    const { member, authored, assigned } = await removedMemberWithTasks();
    expect(await visibleIds(member)).toEqual([]);
    for (const taskId of [authored, assigned]) {
      expect(await canAccessTask(taskId, member.id)).toBeNull();
    }
  });

  it("refuses every write they try", async () => {
    const { member, projectId, authored, assigned } = await removedMemberWithTasks();
    const notFound = { error: "Task not found" };
    for (const taskId of [authored, assigned]) {
      expect(await as(member, () => setTaskDone(taskId, true))).toEqual(notFound);
      expect(await as(member, () => updateTask(taskId, { title: "Mine now", projectId }))).toEqual(notFound);
      expect(await as(member, () => moveTaskToProject(taskId, null))).toEqual(notFound);
      expect(await as(member, () => deleteTask(taskId))).toEqual(notFound);
      await expect(updateTaskFor(member.id, taskId, { done: true })).rejects.toThrow("Task not found");
      await expect(deleteTaskFor(member.id, taskId)).rejects.toThrow("Task not found");
    }
    expect(await as(member, () => reorderTasks([authored, assigned]))).toEqual(notFound);

    const rows = await db.select().from(tasks);
    expect(rows).toHaveLength(2);
    expect(rows.every((task) => !task.done && task.projectId === projectId)).toBe(true);
  });

  it("unassigns them from the project's tasks", async () => {
    const { assigned } = await removedMemberWithTasks();
    expect(await assigneesOf(assigned)).toEqual([]);
  });

  it("leaves tasks outside any project to their creator and assignees", async () => {
    const { admin, member } = await removedMemberWithTasks();
    const personal = await createTaskRow(admin, { assignees: [member] });
    expect(await canAccessTask(personal, member.id)).not.toBeNull();
    expect(await canAccessTask(personal, admin.id)).not.toBeNull();
    const stranger = await createUser("Stranger");
    expect(await canAccessTask(personal, stranger.id)).toBeNull();
  });
});

describe("assignees", () => {
  it("must be members of a project task's project", async () => {
    const admin = await createUser("Admin");
    const member = await createUser("Member");
    const outsider = await createUser("Outsider");
    const projectId = await createProject([[admin, "admin"], [member, "member"]]);

    await expect(
      as(admin, () => createTask({ title: "x", projectId, assigneeIds: [outsider.id] })),
    ).rejects.toThrow("Tasks can only be assigned to members of their project");
    await expect(createTaskFor(admin.id, { title: "x", projectId, assigneeIds: [outsider.id] })).rejects.toThrow();
    expect(await db.select().from(tasks)).toHaveLength(0);

    const created = await as(admin, () => createTask({ title: "x", projectId, assigneeIds: [member.id, admin.id] }));
    expect("taskId" in created).toBe(true);
  });

  it("outside a project, must share a project with you (or be you)", async () => {
    const me = await createUser("Me");
    const colleague = await createUser("Colleague");
    const stranger = await createUser("Stranger");
    await createProject([[me, "admin"], [colleague, "member"]]);

    await expect(
      as(me, () => createTask({ title: "x", assigneeIds: [stranger.id] })),
    ).rejects.toThrow("Tasks can only be assigned to people you share a project with");
    const created = await as(me, () => createTask({ title: "x", assigneeIds: [me.id, colleague.id] }));
    expect("taskId" in created).toBe(true);
  });

  it("who are already on a task outside any project can stay on it", async () => {
    const me = await createUser("Me");
    const former = await createUser("Former colleague");
    const taskId = await createTaskRow(me, { assignees: [former] });

    expect(await as(me, () => updateTask(taskId, { title: "Renamed", assigneeIds: [former.id] }))).toEqual({
      error: undefined,
    });
    expect(await assigneesOf(taskId)).toEqual([former.id]);
  });

  it("are dropped when a task moves into a project they aren't in", async () => {
    const me = await createUser("Me");
    const inBoth = await createUser("In both");
    const onlyA = await createUser("Only in A");
    const projectA = await createProject([[me, "admin"], [inBoth, "member"], [onlyA, "member"]]);
    const projectB = await createProject([[me, "admin"], [inBoth, "member"]]);

    const dragged = await createTaskRow(me, { projectId: projectA, assignees: [inBoth, onlyA] });
    expect(await as(me, () => moveTaskToProject(dragged, projectB))).toEqual({ error: undefined });
    expect(await assigneesOf(dragged)).toEqual([inBoth.id]);

    const viaMcp = await createTaskRow(me, { projectId: projectA, assignees: [inBoth, onlyA] });
    await updateTaskFor(me.id, viaMcp, { projectId: projectB });
    expect(await assigneesOf(viaMcp)).toEqual([inBoth.id]);
  });
});

describe("deadlines", () => {
  async function deadlineOf(taskId: string) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    return task.deadline;
  }

  it("are stored as the calendar day given", async () => {
    const me = await createUser("Me");
    const created = await as(me, () => createTask({ title: "x", deadline: "2026-09-24" }));
    if (!created.taskId) throw new Error("not created");
    expect(await deadlineOf(created.taskId)).toBe("2026-09-24");

    // An API caller's timestamp keeps the day it was written in.
    const task = await createTaskFor(me.id, { title: "y", deadline: "2026-09-15T23:30:00-07:00" });
    expect(task.deadline).toBe("2026-09-15");
    await updateTaskFor(me.id, task.id, { deadline: null });
    expect(await deadlineOf(task.id)).toBeNull();
  });

  it("reject anything that isn't a real day", async () => {
    const me = await createUser("Me");
    for (const deadline of ["2026-02-30", "tomorrow", "09/24/2026"]) {
      expect(await as(me, () => createTask({ title: "x", deadline }))).toEqual({ error: "Invalid deadline" });
      await expect(createTaskFor(me.id, { title: "x", deadline })).rejects.toThrow("Deadline must be a date");
    }
    expect(await db.select().from(tasks)).toHaveLength(0);
  });
});
