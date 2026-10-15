export const ROLES = ["admin", "member"] as const;

export type Role = (typeof ROLES)[number];

/**
 * `Role` is only a compile-time promise: a server action or MCP call can be
 * sent any value at all. Every write of a role goes through this first.
 */
export function isRole(value: unknown): value is Role {
  return (ROLES as readonly unknown[]).includes(value);
}

/**
 * A role in the workspace — the deployment as a whole — as opposed to `Role`,
 * a role in one project. Guests are outsiders invited to a project: they see
 * only the projects they are in and can't create any.
 */
export const WORKSPACE_ROLES = ["owner", "admin", "member", "guest"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** The roles an admin can hand out; there is only ever one owner. */
export const ASSIGNABLE_WORKSPACE_ROLES = ["admin", "member", "guest"] as const;

export type AssignableWorkspaceRole =
  (typeof ASSIGNABLE_WORKSPACE_ROLES)[number];

export function isAssignableWorkspaceRole(
  value: unknown,
): value is AssignableWorkspaceRole {
  return (ASSIGNABLE_WORKSPACE_ROLES as readonly unknown[]).includes(value);
}

/** Owners and admins run the workspace: people, invitations, settings. */
export function managesWorkspace(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export type Person = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type MemberWithUser = Person & {
  role: Role;
  /** A workspace guest: in this project from outside the workspace. */
  guest?: boolean;
};

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
  /** A calendar day, `YYYY-MM-DD` — the same day for everyone, whatever their time zone. */
  deadline: string | null;
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

export type BoardMode = "list" | "kanban" | "calendar";
export const BOARD_MODES: BoardMode[] = ["list", "kanban", "calendar"];
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
    mode: BOARD_MODES.includes(config.mode) ? config.mode : "list",
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
