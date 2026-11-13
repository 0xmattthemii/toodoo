import { dueBucket } from "@/components/board/grouping";
import type { BoardFilter, SortBy, TaskWithMeta } from "@/lib/types";

// Which tasks a board shows and in what order — shared by the boards and the
// tasks widget, which lists a saved view the way its board would.

export function matchesFilter(
  task: TaskWithMeta,
  filter: BoardFilter,
  currentUserId: string,
) {
  switch (filter.field) {
    case "deadline":
      return dueBucket(task) === filter.value;
    case "assignee":
      if (filter.value === "unassigned") return task.assignees.length === 0;
      if (filter.value === "me") {
        return task.assignees.some((person) => person.id === currentUserId);
      }
      return task.assignees.some((person) => person.id === filter.value);
    case "project":
      if (filter.value === "none") return !task.projectId;
      return task.projectId === filter.value;
  }
}

/** Newest first, then by id — the tie-break under every sort, so that equal
 * values never leave two tasks swapping places between renders. */
export function compareNewest(a: TaskWithMeta, b: TaskWithMeta) {
  const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

export function compareTasks(a: TaskWithMeta, b: TaskWithMeta, sortBy: SortBy) {
  switch (sortBy) {
    case "title":
      return a.title.localeCompare(b.title) || compareNewest(a, b);
    case "deadline": {
      // Tasks with no deadline sit at the end rather than at the front.
      if (!a.deadline || !b.deadline) {
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return compareNewest(a, b);
      }
      // YYYY-MM-DD sorts as text in date order.
      const byDeadline = a.deadline.localeCompare(b.deadline);
      return byDeadline !== 0 ? byDeadline : compareNewest(a, b);
    }
    case "created":
      return compareNewest(a, b);
    default:
      return a.position - b.position || compareNewest(a, b);
  }
}
