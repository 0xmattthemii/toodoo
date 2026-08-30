export type TaskStatus = "todo" | "in_progress" | "done";

export type Role = "admin" | "member";

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

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
  status: TaskStatus;
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
export type GroupBy = "status" | "project" | "assignee" | "deadline" | "none";
export type FilterField = "status" | "assignee" | "project" | "deadline";

export type BoardFilter = { field: FilterField; value: string };

export type BoardConfig = {
  mode: BoardMode;
  groupBy: GroupBy;
  filters: BoardFilter[];
};

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  mode: "list",
  groupBy: "status",
  filters: [],
};

export type ViewSummary = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  config: BoardConfig;
};
