import { addDays, format } from "date-fns";
import { describe, expect, it } from "vitest";

import { dueBucket, groupTasks } from "@/components/board/grouping";
import type { Person, ProjectSummary, TaskWithMeta } from "@/lib/types";

const person = (id: string): Person => ({ id, name: id, email: `${id}@test.dev`, image: null });
const project = (id: string): ProjectSummary => ({
  id,
  name: id,
  description: null,
  icon: null,
  color: null,
  role: "member",
});
const task = (id: string, fields: Partial<TaskWithMeta> = {}): TaskWithMeta => ({
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

// The same tasks the board shows ungrouped, including the awkward ones: a
// project the user isn't in (yet or any more) and an assignee who shares
// no project with them.
const tasks = [
  task("in-mine", { projectId: mine.id, projectName: "mine", assignees: [me] }),
  task("elsewhere", { projectId: "left-project", projectName: "Left project" }),
  task("with-former", { assignees: [former] }),
  task("with-both", { assignees: [me, former] }),
  task("bare"),
];

function idsIn(groups: ReturnType<typeof groupTasks>) {
  return new Set(groups.flatMap((group) => group.tasks.map((t) => t.id)));
}

describe("groupTasks", () => {
  it.each(["project", "assignee", "deadline", "none"] as const)(
    "grouped by %s, every task lands in a group",
    (groupBy) => {
      const groups = groupTasks(tasks, groupBy, { projects: [mine], people: [me] });
      expect(idsIn(groups)).toEqual(new Set(tasks.map((t) => t.id)));
    },
  );

  it("labels groups it had to make from the tasks themselves", () => {
    const byProject = groupTasks(tasks, "project", { projects: [mine], people: [me] });
    expect(byProject.map((group) => group.label)).toEqual(["mine", "Left project", "No project"]);

    const byAssignee = groupTasks(tasks, "assignee", { projects: [mine], people: [me] });
    expect(byAssignee.map((group) => [group.label, group.tasks.map((t) => t.id)])).toEqual([
      ["me", ["in-mine", "with-both"]],
      ["former", ["with-former", "with-both"]],
      ["Unassigned", ["elsewhere", "bare"]],
    ]);
  });

  it("on a project board, shows only that project and loose tasks", () => {
    const groups = groupTasks(tasks.slice(0, 1), "project", {
      projects: [mine],
      people: [me],
      scopedProjectId: mine.id,
    });
    expect(groups.map((group) => group.key)).toEqual([mine.id, "none"]);
  });
});

describe("dueBucket", () => {
  const day = (offset: number) => format(addDays(new Date(), offset), "yyyy-MM-dd");
  it.each([
    [-1, "overdue"],
    [0, "today"],
    [3, "week"],
    [10, "later"],
  ])("a deadline %i days away is %s", (offset, bucket) => {
    expect(dueBucket({ deadline: day(offset) })).toBe(bucket);
  });
  it("no deadline", () => expect(dueBucket({ deadline: null })).toBe("none"));
});
