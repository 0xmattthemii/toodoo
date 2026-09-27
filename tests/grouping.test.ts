import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dueBucket, groupTasks } from "@/components/board/grouping";
import type { Person, ProjectSummary, TaskWithMeta } from "@/lib/types";

// A fixed "now" (a Saturday afternoon), so buckets never shift under a run
// that crosses midnight.
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 8, 26, 15, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

const person = (id: string): Person => ({
  id,
  name: id,
  email: `${id}@test.dev`,
  image: null,
});
const project = (id: string): ProjectSummary => ({
  id,
  name: id,
  description: null,
  icon: null,
  color: null,
  role: "member",
});
const task = (
  id: string,
  fields: Partial<TaskWithMeta> = {},
): TaskWithMeta => ({
  id,
  title: id,
  description: null,
  done: false,
  deadline: null,
  projectId: null,
  projectName: null,
  position: 0,
  createdBy: "me",
  createdAt: new Date(0),
  assignees: [],
  ...fields,
});

const me = person("me");
const former = person("former");
const mine = project("mine");

// What an "All tasks" board may show, including the awkward cases: a project
// the user has just left (the snapshot catching up), an assignee who shares
// no project with them any more, and a task with two assignees.
const tasks = [
  task("in-mine", {
    projectId: mine.id,
    projectName: "mine",
    assignees: [me],
    deadline: "2026-09-25",
  }),
  task("elsewhere", {
    projectId: "left-project",
    projectName: "Left project",
    deadline: "2026-09-26",
  }),
  task("with-former", { assignees: [former], deadline: "2026-09-30" }),
  task("with-both", { assignees: [me, former], deadline: "2026-10-20" }),
  task("bare"),
];

const known = { projects: [mine], people: [me] };
const ids = (groups: ReturnType<typeof groupTasks>) =>
  groups.map((group) => [group.label, group.tasks.map((t) => t.id)]);

describe("groupTasks", () => {
  it.each(["project", "assignee", "deadline", "none"] as const)(
    "grouped by %s, puts every task in a group",
    (groupBy) => {
      const grouped = new Set(
        groupTasks(tasks, groupBy, known).flatMap((g) =>
          g.tasks.map((t) => t.id),
        ),
      );
      expect(grouped).toEqual(new Set(tasks.map((t) => t.id)));
    },
  );

  it("by project, gives a project the user isn't in a group of its own", () => {
    expect(ids(groupTasks(tasks, "project", known))).toEqual([
      ["mine", ["in-mine"]],
      ["Left project", ["elsewhere"]],
      ["No project", ["with-former", "with-both", "bare"]],
    ]);
  });

  it("by assignee, gives someone outside the user's projects a group of their own", () => {
    expect(ids(groupTasks(tasks, "assignee", known))).toEqual([
      ["me", ["in-mine", "with-both"]],
      ["former", ["with-former", "with-both"]],
      ["Unassigned", ["elsewhere", "bare"]],
    ]);
  });

  it("by deadline, orders the buckets from overdue to none", () => {
    expect(ids(groupTasks(tasks, "deadline", known))).toEqual([
      ["Overdue", ["in-mine"]],
      ["Today", ["elsewhere"]],
      ["This week", ["with-former"]],
      ["Later", ["with-both"]],
      ["No deadline", ["bare"]],
    ]);
  });

  it("on a project's own board, shows only that project and loose tasks", () => {
    const onBoard = tasks.filter((t) => t.projectId === mine.id);
    const groups = groupTasks(onBoard, "project", {
      ...known,
      scopedProjectId: mine.id,
    });
    expect(groups.map((group) => group.key)).toEqual([mine.id, "none"]);
  });
});

describe("dueBucket", () => {
  it.each([
    ["2026-09-25", "overdue"],
    ["2026-09-26", "today"],
    ["2026-09-27", "week"],
    ["2026-10-02", "week"], // six days out: still this week
    ["2026-10-03", "later"], // seven days out
    [null, "none"],
  ])("files %j under %s", (deadline, bucket) => {
    expect(dueBucket({ deadline })).toBe(bucket);
  });
});
