"use client";

import { addDays, format, isBefore, isToday, startOfDay } from "date-fns";
import { CalendarClock, Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { setTaskStatus } from "@/actions/tasks";
import { TaskDialog } from "@/components/task-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  TASK_STATUSES,
  type Person,
  type ProjectSummary,
  type TaskStatus,
  type TaskWithMeta,
} from "@/lib/types";

type View = "list" | "kanban";
type GroupBy = "status" | "project" | "assignee" | "deadline" | "none";
type DueBucket = "overdue" | "today" | "week" | "later" | "none";

const GROUP_ITEMS: { value: GroupBy; label: string }[] = [
  { value: "status", label: "By status" },
  { value: "project", label: "By project" },
  { value: "assignee", label: "By assignee" },
  { value: "deadline", label: "By deadline" },
  { value: "none", label: "No grouping" },
];

const DUE_ITEMS = [
  { value: "all", label: "Any deadline" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Due this week" },
  { value: "none", label: "No deadline" },
];

const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No deadline",
};

function dueBucket(task: Pick<TaskWithMeta, "deadline">): DueBucket {
  if (!task.deadline) return "none";
  const date = new Date(task.deadline);
  const today = startOfDay(new Date());
  if (isToday(date)) return "today";
  if (isBefore(date, today)) return "overdue";
  if (isBefore(date, addDays(today, 7))) return "week";
  return "later";
}

function statusLabel(status: TaskStatus) {
  return TASK_STATUSES.find((item) => item.value === status)?.label ?? status;
}

type Group = { key: string; label: string; tasks: TaskWithMeta[] };

export function TaskBoard({
  tasks,
  projects,
  people,
  currentUserId,
  scopedProjectId,
}: {
  tasks: TaskWithMeta[];
  projects: ProjectSummary[];
  people: Person[];
  currentUserId: string;
  scopedProjectId?: string;
}) {
  const [view, setView] = useState<View>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithMeta | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, TaskStatus>
  >({});
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Reset optimistic status overrides once fresh server data arrives.
  const [prevTasks, setPrevTasks] = useState(tasks);
  if (prevTasks !== tasks) {
    setPrevTasks(tasks);
    setStatusOverrides({});
  }

  const effectiveTasks = useMemo(
    () =>
      tasks.map((task) =>
        statusOverrides[task.id]
          ? { ...task, status: statusOverrides[task.id] }
          : task,
      ),
    [tasks, statusOverrides],
  );

  const filteredTasks = useMemo(() => {
    return effectiveTasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (assigneeFilter === "unassigned") {
        if (task.assignees.length > 0) return false;
      } else if (assigneeFilter === "me") {
        if (!task.assignees.some((person) => person.id === currentUserId))
          return false;
      } else if (assigneeFilter !== "all") {
        if (!task.assignees.some((person) => person.id === assigneeFilter))
          return false;
      }
      if (!scopedProjectId && projectFilter !== "all") {
        if (projectFilter === "none") {
          if (task.projectId) return false;
        } else if (task.projectId !== projectFilter) {
          return false;
        }
      }
      if (dueFilter !== "all" && dueBucket(task) !== dueFilter) return false;
      return true;
    });
  }, [
    effectiveTasks,
    statusFilter,
    assigneeFilter,
    projectFilter,
    dueFilter,
    currentUserId,
    scopedProjectId,
  ]);

  const groups = useMemo<Group[]>(() => {
    const list = filteredTasks;
    switch (groupBy) {
      case "status":
        return TASK_STATUSES.map(({ value, label }) => ({
          key: value,
          label,
          tasks: list.filter((task) => task.status === value),
        }));
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
        const noProject = list.filter((task) => !task.projectId);
        if (noProject.length > 0) {
          result.push({ key: "none", label: "No project", tasks: noProject });
        }
        return result.filter((group) => group.tasks.length > 0);
      }
      case "assignee": {
        const result: Group[] = people.map((person) => ({
          key: person.id,
          label: person.name,
          tasks: list.filter((task) =>
            task.assignees.some((assignee) => assignee.id === person.id),
          ),
        }));
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
  }, [filteredTasks, groupBy, projects, people, scopedProjectId]);

  function changeStatus(taskId: string, status: TaskStatus) {
    setStatusOverrides((current) => ({ ...current, [taskId]: status }));
    startTransition(async () => {
      const result = await setTaskStatus(taskId, status);
      if (result.error) {
        toast.error(result.error);
        setStatusOverrides((current) => {
          const next = { ...current };
          delete next[taskId];
          return next;
        });
      }
    });
  }

  function openCreate() {
    setEditingTask(null);
    setDialogOpen(true);
  }

  function openEdit(task: TaskWithMeta) {
    setEditingTask(task);
    setDialogOpen(true);
  }

  const assigneeItems = [
    { value: "all", label: "All people" },
    { value: "me", label: "Assigned to me" },
    { value: "unassigned", label: "Unassigned" },
    ...people
      .filter((person) => person.id !== currentUserId)
      .map((person) => ({ value: person.id, label: person.name })),
  ];

  const projectItems = [
    { value: "all", label: "All projects" },
    { value: "none", label: "No project" },
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ];

  const statusItems = [
    { value: "all", label: "All statuses" },
    ...TASK_STATUSES,
  ];

  const canDrag = view === "kanban" && groupBy === "status";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 px-6">
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select
          value={groupBy}
          onValueChange={(value) => setGroupBy(value as GroupBy)}
          items={GROUP_ITEMS}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_ITEMS.filter(
              (item) => !(scopedProjectId && item.value === "project"),
            ).map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as string)}
          items={statusItems}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={assigneeFilter}
          onValueChange={(value) => setAssigneeFilter(value as string)}
          items={assigneeItems}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {assigneeItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!scopedProjectId ? (
          <Select
            value={projectFilter}
            onValueChange={(value) => setProjectFilter(value as string)}
            items={projectItems}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projectItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select
          value={dueFilter}
          onValueChange={(value) => setDueFilter(value as string)}
          items={DUE_ITEMS}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DUE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button size="sm" onClick={openCreate}>
            <Plus />
            New task
          </Button>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {tasks.length === 0
              ? "No tasks yet. Create your first one."
              : "No tasks match the current filters."}
          </p>
          {tasks.length === 0 ? (
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus />
              New task
            </Button>
          ) : null}
        </div>
      ) : view === "list" ? (
        <div className="flex flex-col gap-6 px-6 pb-6">
          {groups.map((group) => (
            <section key={group.key}>
              {groupBy !== "none" ? (
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  {group.label}
                  <span className="text-xs text-muted-foreground">
                    {group.tasks.length}
                  </span>
                </h3>
              ) : null}
              <div className="overflow-hidden rounded-xl border">
                {group.tasks.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">
                    No tasks
                  </p>
                ) : (
                  group.tasks.map((task, index) => (
                    <TaskRow
                      key={`${group.key}-${task.id}`}
                      task={task}
                      showProject={!scopedProjectId && groupBy !== "project"}
                      isFirst={index === 0}
                      onOpen={() => openEdit(task)}
                      onToggleDone={(done) =>
                        changeStatus(task.id, done ? "done" : "todo")
                      }
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 pb-6">
          {groups.map((group) => (
            <div
              key={group.key}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 p-2 transition-colors",
                canDrag && dragOverGroup === group.key && "bg-accent",
              )}
              onDragOver={
                canDrag
                  ? (event) => {
                      event.preventDefault();
                      setDragOverGroup(group.key);
                    }
                  : undefined
              }
              onDragLeave={
                canDrag
                  ? (event) => {
                      if (event.currentTarget === event.target) {
                        setDragOverGroup(null);
                      }
                    }
                  : undefined
              }
              onDrop={
                canDrag
                  ? (event) => {
                      event.preventDefault();
                      setDragOverGroup(null);
                      const taskId = event.dataTransfer.getData("text/plain");
                      if (taskId) {
                        changeStatus(taskId, group.key as TaskStatus);
                      }
                    }
                  : undefined
              }
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="text-sm font-medium">{group.label}</span>
                <span className="text-xs text-muted-foreground">
                  {group.tasks.length}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-1">
                {group.tasks.map((task) => (
                  <TaskCard
                    key={`${group.key}-${task.id}`}
                    task={task}
                    showProject={!scopedProjectId && groupBy !== "project"}
                    draggable={canDrag}
                    onOpen={() => openEdit(task)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        projects={projects}
        people={people}
        defaultProjectId={scopedProjectId}
      />
    </div>
  );
}

function DeadlineChip({ task }: { task: TaskWithMeta }) {
  if (!task.deadline) return null;
  const overdue = dueBucket(task) === "overdue" && task.status !== "done";
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs whitespace-nowrap",
        overdue ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      <CalendarClock className="size-3.5" />
      {format(new Date(task.deadline), "MMM d")}
    </span>
  );
}

function AvatarStack({ people }: { people: Person[] }) {
  if (people.length === 0) return null;
  return (
    <span className="flex -space-x-1.5">
      {people.slice(0, 3).map((person) => (
        <UserAvatar
          key={person.id}
          person={person}
          className="size-5 ring-2 ring-background"
        />
      ))}
      {people.length > 3 ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-background">
          +{people.length - 3}
        </span>
      ) : null}
    </span>
  );
}

function TaskRow({
  task,
  showProject,
  isFirst,
  onOpen,
  onToggleDone,
}: {
  task: TaskWithMeta;
  showProject: boolean;
  isFirst: boolean;
  onOpen: () => void;
  onToggleDone: (done: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 bg-background px-3 py-2.5 text-left hover:bg-muted/50",
        !isFirst && "border-t",
      )}
      onClick={onOpen}
    >
      <span onClick={(event) => event.stopPropagation()} className="flex">
        <Checkbox
          checked={task.status === "done"}
          onCheckedChange={(checked) => onToggleDone(checked === true)}
          aria-label={`Mark "${task.title}" as ${task.status === "done" ? "not done" : "done"}`}
        />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          task.status === "done" && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>
      {task.status === "in_progress" ? (
        <Badge variant="secondary">{statusLabel(task.status)}</Badge>
      ) : null}
      {showProject && task.projectName ? (
        <Badge variant="outline" className="max-w-32">
          <span className="truncate">{task.projectName}</span>
        </Badge>
      ) : null}
      <DeadlineChip task={task} />
      <AvatarStack people={task.assignees} />
    </div>
  );
}

function TaskCard({
  task,
  showProject,
  draggable,
  onOpen,
}: {
  task: TaskWithMeta;
  showProject: boolean;
  draggable: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-background p-3 shadow-xs hover:bg-muted/30"
      draggable={draggable}
      onDragStart={(event) =>
        event.dataTransfer.setData("text/plain", task.id)
      }
      onClick={onOpen}
    >
      <span
        className={cn(
          "text-sm font-medium",
          task.status === "done" && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>
      {task.description ? (
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {task.description}
        </span>
      ) : null}
      {showProject || task.deadline || task.assignees.length > 0 ? (
        <span className="flex items-center gap-2">
          {showProject && task.projectName ? (
            <Badge variant="outline" className="max-w-28">
              <span className="truncate">{task.projectName}</span>
            </Badge>
          ) : null}
          <DeadlineChip task={task} />
          <span className="ml-auto">
            <AvatarStack people={task.assignees} />
          </span>
        </span>
      ) : null}
    </div>
  );
}
