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
export type FilterField = "assignee" | "project" | "deadline";

export type BoardFilter = { field: FilterField; value: string };

export type BoardConfig = {
  mode: BoardMode;
  groupBy: GroupBy;
  filters: BoardFilter[];
};

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  mode: "list",
  groupBy: "none",
  filters: [],
};

export type ViewSummary = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  config: BoardConfig;
};
