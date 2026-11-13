import { format, isToday, isTomorrow } from "date-fns";

import {
  compareNewest,
  compareTasks,
  matchesFilter,
} from "@/components/board/filtering";
import { deadlineDate, toDeadline } from "@/lib/deadline";
import type { TaskWithMeta, ViewSummary } from "@/lib/types";

// What the tasks widget lists: one of the user's lists, simplified to the
// tasks still to do.

export type WidgetScope =
  | { kind: "mine" }
  | { kind: "all" }
  | { kind: "project"; id: string }
  | { kind: "view"; id: string };

export const DEFAULT_SCOPE: WidgetScope = { kind: "mine" };

/** The scope as the string it is remembered under. */
export function scopeKey(scope: WidgetScope) {
  return scope.kind === "project" || scope.kind === "view"
    ? `${scope.kind}:${scope.id}`
    : scope.kind;
}

/** Reads a remembered scope back; anything unrecognized is "My tasks". */
export function parseScope(key: string | null): WidgetScope {
  if (key === "mine" || key === "all") return { kind: key };
  const [kind, id] = key?.split(":") ?? [];
  if ((kind === "project" || kind === "view") && id) return { kind, id };
  return DEFAULT_SCOPE;
}

/**
 * "My tasks": assigned to the user, or theirs alone — a task outside any
 * project with nobody on it is one only its creator can see.
 */
function isMine(task: TaskWithMeta, meId: string) {
  if (task.assignees.some((person) => person.id === meId)) return true;
  return !task.projectId && task.assignees.length === 0;
}

/** Dated tasks first, soonest on top; the rest in their manual order. */
function compareSoonest(a: TaskWithMeta, b: TaskWithMeta) {
  if (a.deadline && b.deadline && a.deadline !== b.deadline) {
    // YYYY-MM-DD sorts as text in date order.
    return a.deadline.localeCompare(b.deadline);
  }
  if (!a.deadline !== !b.deadline) return a.deadline ? -1 : 1;
  return a.position - b.position || compareNewest(a, b);
}

/**
 * The tasks a scope lists, in order. A saved view keeps its own filters and
 * sort; the others put what is due soonest on top. Done tasks are left out,
 * bar those in `keepDone` — ones just ticked, which stay a moment so a slip
 * can be undone.
 */
export function scopeTasks(
  scope: WidgetScope,
  tasks: TaskWithMeta[],
  {
    meId,
    view,
    keepDone,
  }: {
    meId: string;
    /** The view a `view` scope points at. */
    view?: ViewSummary;
    keepDone?: ReadonlySet<string>;
  },
) {
  const inScope = (task: TaskWithMeta) => {
    switch (scope.kind) {
      case "mine":
        return isMine(task, meId);
      case "all":
        return true;
      case "project":
        return task.projectId === scope.id;
      case "view":
        return (
          !!view &&
          view.config.filters.every((filter) =>
            matchesFilter(task, filter, meId),
          )
        );
    }
  };
  const sortBy = scope.kind === "view" ? view?.config.sortBy : undefined;
  return tasks
    .filter((task) => (!task.done || keepDone?.has(task.id)) && inScope(task))
    .sort((a, b) => (sortBy ? compareTasks(a, b, sortBy) : compareSoonest(a, b)));
}

export type NewTaskFields = {
  projectId: string | null;
  assignMe: boolean;
  deadline: string | null;
};

/**
 * What a task added from the widget starts with, so that it lands in the
 * list it was typed into: the project of a project scope, the user on "My
 * tasks", and for a saved view whatever its filters plainly ask for.
 */
export function newTaskFields(
  scope: WidgetScope,
  view?: ViewSummary,
): NewTaskFields {
  const fields: NewTaskFields = {
    projectId: null,
    assignMe: false,
    deadline: null,
  };
  switch (scope.kind) {
    case "mine":
      return { ...fields, assignMe: true };
    case "project":
      return { ...fields, projectId: scope.id };
    case "view":
      for (const filter of view?.config.filters ?? []) {
        if (filter.field === "project" && filter.value !== "none") {
          fields.projectId = filter.value;
        } else if (filter.field === "assignee" && filter.value === "me") {
          fields.assignMe = true;
        } else if (filter.field === "deadline" && filter.value === "today") {
          fields.deadline = toDeadline(new Date());
        }
      }
      return fields;
    default:
      return fields;
  }
}

/** A deadline in as few characters as say it: "Today", "Tomorrow", "Nov 12". */
export function dueLabel(deadline: string) {
  const date = deadlineDate(deadline);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "MMM d");
}
