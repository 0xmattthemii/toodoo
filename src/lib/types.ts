export type Role = "admin" | "member";

export type Person = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type MemberWithUser = Person & { role: Role };

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  role: Role;
};

export type TaskWithMeta = {
  id: string;
  title: string;
  description: string | null;
  done: boolean;
  deadline: Date | null;
  projectId: string | null;
  projectName: string | null;
  /** Ascending manual order; see `sortBy: "manual"`. */
  position: number;
  createdBy: string;
  createdAt: Date;
  assignees: Person[];
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
};

// ---- Board configuration (used by the toolbar, board content, and saved views) ----

export type BoardMode = "list" | "kanban";
export type GroupBy = "project" | "assignee" | "deadline" | "none";
/** "manual" is the order tasks were dragged into; the rest are fields. */
export type SortBy = "manual" | "title" | "deadline" | "created";
export type FilterField = "assignee" | "project" | "deadline";

export const GROUP_BY_VALUES: GroupBy[] = [
  "project",
  "assignee",
  "deadline",
  "none",
];
export const SORT_BY_VALUES: SortBy[] = [
  "manual",
  "title",
  "deadline",
  "created",
];
export const FILTER_FIELDS: FilterField[] = [
  "assignee",
  "project",
  "deadline",
];

export type BoardFilter = { field: FilterField; value: string };

export type BoardConfig = {
  mode: BoardMode;
  groupBy: GroupBy;
  sortBy: SortBy;
  filters: BoardFilter[];
};

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  mode: "list",
  groupBy: "none",
  sortBy: "manual",
  filters: [],
};

/** Enough for any real board; also caps what a saved view can carry. */
const MAX_FILTERS = 20;

/**
 * Coerces a stored or submitted config to the current shape: unknown values
 * fall back to their defaults and fields from older app versions are dropped.
 * Used on both the write path (saving a view) and the read path (loading one),
 * so a view always loads back the way it was saved.
 */
export function normalizeBoardConfig(config: BoardConfig): BoardConfig {
  return {
    mode: config.mode === "kanban" ? "kanban" : "list",
    groupBy: GROUP_BY_VALUES.includes(config.groupBy) ? config.groupBy : "none",
    // Views saved before sorting existed carry no sortBy.
    sortBy: SORT_BY_VALUES.includes(config.sortBy) ? config.sortBy : "manual",
    filters: (config.filters ?? [])
      .filter(
        (filter) =>
          FILTER_FIELDS.includes(filter.field) &&
          typeof filter.value === "string",
      )
      .slice(0, MAX_FILTERS),
  };
}

export type ViewSummary = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  config: BoardConfig;
};
