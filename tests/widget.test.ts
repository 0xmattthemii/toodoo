import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dueLabel,
  newTaskFields,
  parseScope,
  scopeKey,
  scopeTasks,
  type WidgetScope,
} from "@/components/widget/scope";
import {
  DEFAULT_BOARD_CONFIG,
  type BoardFilter,
  type Person,
  type SortBy,
  type TaskWithMeta,
  type ViewSummary,
} from "@/lib/types";

// A fixed "now" (a Saturday afternoon), so "today" never shifts under a run
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
const me = person("me");
const bob = person("bob");

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
  createdBy: me.id,
  createdAt: new Date(2026, 8, 1),
  assignees: [],
  ...fields,
});

const view = (filters: BoardFilter[], sortBy: SortBy = "manual"): ViewSummary => ({
  id: "v1",
  name: "View",
  icon: null,
  color: null,
  config: { ...DEFAULT_BOARD_CONFIG, filters, sortBy },
});

const ids = (tasks: TaskWithMeta[]) => tasks.map((t) => t.id);

describe("scope keys", () => {
  it("round-trips every kind of scope", () => {
    const scopes: WidgetScope[] = [
      { kind: "mine" },
      { kind: "all" },
      { kind: "project", id: "p1" },
      { kind: "view", id: "v1" },
    ];
    for (const scope of scopes) {
      expect(parseScope(scopeKey(scope))).toEqual(scope);
    }
  });

  it("falls back to My tasks for anything it doesn't know", () => {
    for (const key of [null, "", "everything", "project:", "team:t1"]) {
      expect(parseScope(key)).toEqual({ kind: "mine" });
    }
  });
});

describe("scopeTasks", () => {
  it("lists as mine what is assigned to me or mine alone", () => {
    const tasks = [
      task("assigned", { projectId: "p1", assignees: [bob, me] }),
      task("personal"),
      task("someone-else", { projectId: "p1", assignees: [bob] }),
      task("unassigned-in-project", { projectId: "p1" }),
      task("shared-with-me-only", { createdBy: bob.id, assignees: [me] }),
    ];
    expect(ids(scopeTasks({ kind: "mine" }, tasks, { meId: me.id })).sort()).toEqual(
      ["assigned", "personal", "shared-with-me-only"],
    );
  });

  it("scopes to a project", () => {
    const tasks = [
      task("in", { projectId: "p1" }),
      task("out", { projectId: "p2" }),
      task("none"),
    ];
    expect(
      ids(scopeTasks({ kind: "project", id: "p1" }, tasks, { meId: me.id })),
    ).toEqual(["in"]);
  });

  it("puts what is due soonest on top, then the manual order", () => {
    const tasks = [
      task("undated-second", { position: 2 }),
      task("later", { deadline: "2026-10-03" }),
      task("undated-first", { position: 1 }),
      task("overdue", { deadline: "2026-09-20" }),
      task("today", { deadline: "2026-09-26" }),
    ];
    expect(ids(scopeTasks({ kind: "all" }, tasks, { meId: me.id }))).toEqual([
      "overdue",
      "today",
      "later",
      "undated-first",
      "undated-second",
    ]);
  });

  it("leaves done tasks out, bar the ones just ticked", () => {
    const tasks = [
      task("open"),
      task("done", { done: true }),
      task("just-ticked", { done: true }),
    ];
    expect(ids(scopeTasks({ kind: "all" }, tasks, { meId: me.id }))).toEqual([
      "open",
    ]);
    expect(
      ids(
        scopeTasks({ kind: "all" }, tasks, {
          meId: me.id,
          keepDone: new Set(["just-ticked"]),
        }),
      ).sort(),
    ).toEqual(["just-ticked", "open"]);
  });

  it("lists a saved view by its own filters and sort", () => {
    const tasks = [
      task("b", { title: "b", projectId: "p1", assignees: [me] }),
      task("a", { title: "a", projectId: "p1", assignees: [me] }),
      task("not-mine", { projectId: "p1", assignees: [bob] }),
      task("elsewhere", { projectId: "p2", assignees: [me] }),
    ];
    const saved = view(
      [
        { field: "project", value: "p1" },
        { field: "assignee", value: "me" },
      ],
      "title",
    );
    expect(
      ids(scopeTasks({ kind: "view", id: "v1" }, tasks, { meId: me.id, view: saved })),
    ).toEqual(["a", "b"]);
  });

  it("lists nothing for a view that is gone", () => {
    expect(
      scopeTasks({ kind: "view", id: "v1" }, [task("t")], { meId: me.id }),
    ).toEqual([]);
  });
});

describe("newTaskFields", () => {
  it("starts a task where its list would show it", () => {
    expect(newTaskFields({ kind: "mine" })).toEqual({
      projectId: null,
      assignMe: true,
      deadline: null,
    });
    expect(newTaskFields({ kind: "all" })).toEqual({
      projectId: null,
      assignMe: false,
      deadline: null,
    });
    expect(newTaskFields({ kind: "project", id: "p1" })).toEqual({
      projectId: "p1",
      assignMe: false,
      deadline: null,
    });
  });

  it("follows what a saved view's filters plainly ask for", () => {
    const saved = view([
      { field: "project", value: "p1" },
      { field: "assignee", value: "me" },
      { field: "deadline", value: "today" },
    ]);
    expect(newTaskFields({ kind: "view", id: "v1" }, saved)).toEqual({
      projectId: "p1",
      assignMe: true,
      deadline: "2026-09-26",
    });
    // Filters a new task can't be made to satisfy by itself are left alone.
    const loose = view([
      { field: "project", value: "none" },
      { field: "assignee", value: "bob" },
      { field: "deadline", value: "overdue" },
    ]);
    expect(newTaskFields({ kind: "view", id: "v1" }, loose)).toEqual({
      projectId: null,
      assignMe: false,
      deadline: null,
    });
  });
});

describe("dueLabel", () => {
  it("names today and tomorrow, and dates the rest", () => {
    expect(dueLabel("2026-09-26")).toBe("Today");
    expect(dueLabel("2026-09-27")).toBe("Tomorrow");
    expect(dueLabel("2026-09-25")).toBe("Sep 25");
    expect(dueLabel("2026-11-12")).toBe("Nov 12");
  });
});
