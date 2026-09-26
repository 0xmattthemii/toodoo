import { addDays, isBefore, isToday, startOfDay } from "date-fns";

import { deadlineDate } from "@/lib/deadline";
import type { GroupBy, Person, ProjectSummary, TaskWithMeta } from "@/lib/types";

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No deadline",
};

export function dueBucket(task: Pick<TaskWithMeta, "deadline">): DueBucket {
  if (!task.deadline) return "none";
  const date = deadlineDate(task.deadline);
  const today = startOfDay(new Date());
  if (isToday(date)) return "today";
  if (isBefore(date, today)) return "overdue";
  if (isBefore(date, addDays(today, 7))) return "week";
  return "later";
}

export type Group = { key: string; label: string; tasks: TaskWithMeta[] };

/**
 * Groups for projects or people that tasks on the board point at but that
 * `known` doesn't list — a project the user just left while the snapshot
 * catches up, an assignee who shares no project with them any more. Labelled
 * from the tasks themselves, so every task always lands in some group.
 */
function strayGroups(
  list: TaskWithMeta[],
  known: { id: string }[],
  keysOf: (task: TaskWithMeta) => { key: string; label: string }[],
): Group[] {
  const knownIds = new Set(known.map((item) => item.id));
  const extra = new Map<string, Group>();
  for (const task of list) {
    for (const { key, label } of keysOf(task)) {
      if (knownIds.has(key)) continue;
      const group = extra.get(key) ?? { key, label, tasks: [] };
      group.tasks.push(task);
      extra.set(key, group);
    }
  }
  return [...extra.values()];
}

/**
 * Splits a board's (already filtered and sorted) tasks into its groups. Every
 * task in `list` lands in at least one group — a task with two assignees
 * sits in both of theirs — so grouping never hides anything the board shows
 * ungrouped.
 */
export function groupTasks(
  list: TaskWithMeta[],
  groupBy: GroupBy,
  {
    projects,
    people,
    scopedProjectId,
  }: {
    projects: ProjectSummary[];
    people: Person[];
    scopedProjectId?: string;
  },
): Group[] {
  switch (groupBy) {
    case "project": {
      const result: Group[] = projects
        .filter(
          (project) => !scopedProjectId || project.id === scopedProjectId,
        )
        .map((project) => ({
          key: project.id,
          label: project.name,
          tasks: list.filter((task) => task.projectId === project.id),
        }));
      if (!scopedProjectId) {
        result.push(
          ...strayGroups(list, projects, (task) =>
            task.projectId
              ? [{ key: task.projectId, label: task.projectName ?? "Project" }]
              : [],
          ),
        );
      }
      result.push({
        key: "none",
        label: "No project",
        tasks: list.filter((task) => !task.projectId),
      });
      return result;
    }
    case "assignee": {
      const result: Group[] = people.map((person) => ({
        key: person.id,
        label: person.name,
        tasks: list.filter((task) =>
          task.assignees.some((assignee) => assignee.id === person.id),
        ),
      }));
      result.push(
        ...strayGroups(list, people, (task) =>
          task.assignees.map((assignee) => ({
            key: assignee.id,
            label: assignee.name,
          })),
        ),
      );
      const unassigned = list.filter((task) => task.assignees.length === 0);
      if (unassigned.length > 0) {
        result.push({ key: "none", label: "Unassigned", tasks: unassigned });
      }
      return result.filter((group) => group.tasks.length > 0);
    }
    case "deadline": {
      const order: DueBucket[] = ["overdue", "today", "week", "later", "none"];
      return order
        .map((bucket) => ({
          key: bucket,
          label: DUE_BUCKET_LABELS[bucket],
          tasks: list.filter((task) => dueBucket(task) === bucket),
        }))
        .filter((group) => group.tasks.length > 0);
    }
    default:
      return [{ key: "all", label: "All tasks", tasks: list }];
  }
}
