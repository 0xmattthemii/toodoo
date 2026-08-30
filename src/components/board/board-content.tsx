"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { addDays, format, isBefore, isToday, startOfDay } from "date-fns";
import { CalendarClock, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { moveTaskToProject, setTaskStatus } from "@/actions/tasks";
import { useBoard } from "@/components/board/board-context";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  TASK_STATUSES,
  type BoardFilter,
  type Person,
  type ProjectSummary,
  type TaskStatus,
  type TaskWithMeta,
} from "@/lib/types";

type DueBucket = "overdue" | "today" | "week" | "later" | "none";

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

function matchesFilter(
  task: TaskWithMeta,
  filter: BoardFilter,
  currentUserId: string,
) {
  switch (filter.field) {
    case "status":
      return task.status === filter.value;
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

function statusLabel(status: TaskStatus) {
  return TASK_STATUSES.find((item) => item.value === status)?.label ?? status;
}

// Prefer the column under the pointer; fall back to overlap for edge drops.
const collisionDetection: CollisionDetection = (args) => {
  const withPointer = pointerWithin(args);
  return withPointer.length > 0 ? withPointer : rectIntersection(args);
};

type Group = { key: string; label: string; tasks: TaskWithMeta[] };

export function BoardContent({
  tasks,
  projects,
  people,
}: {
  tasks: TaskWithMeta[];
  projects: ProjectSummary[];
  people: Person[];
}) {
  const board = useBoard();
  const { config, currentUserId, scopedProjectId, registerOptions } = board;

  // Feed dropdown options (filter values, task dialog selects) to the toolbar.
  useEffect(() => {
    registerOptions({ projects, people });
  }, [registerOptions, projects, people]);

  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<TaskWithMeta>>
  >({});
  const [activeTask, setActiveTask] = useState<TaskWithMeta | null>(null);
  const justDragged = useRef(false);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    // A small distance threshold keeps plain clicks opening the edit dialog.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Reset optimistic overrides once fresh server data arrives.
  const [prevTasks, setPrevTasks] = useState(tasks);
  if (prevTasks !== tasks) {
    setPrevTasks(tasks);
    setTaskOverrides({});
  }

  const filteredTasks = useMemo(() => {
    const effective = tasks.map((task) =>
      taskOverrides[task.id] ? { ...task, ...taskOverrides[task.id] } : task,
    );
    return effective.filter((task) =>
      config.filters.every((filter) =>
        matchesFilter(task, filter, currentUserId),
      ),
    );
  }, [tasks, taskOverrides, config.filters, currentUserId]);

  const groups = useMemo<Group[]>(() => {
    const list = filteredTasks;
    switch (config.groupBy) {
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
  }, [filteredTasks, config.groupBy, projects, people, scopedProjectId]);

  function revertOverride(taskId: string) {
    setTaskOverrides((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function changeStatus(taskId: string, status: TaskStatus) {
    setTaskOverrides((current) => ({
      ...current,
      [taskId]: { ...current[taskId], status },
    }));
    startTransition(async () => {
      const result = await setTaskStatus(taskId, status);
      if (result.error) {
        toast.error(result.error);
        revertOverride(taskId);
      }
    });
  }

  function moveProject(taskId: string, projectId: string | null) {
    const projectName = projectId
      ? (projects.find((project) => project.id === projectId)?.name ?? null)
      : null;
    setTaskOverrides((current) => ({
      ...current,
      [taskId]: { ...current[taskId], projectId, projectName },
    }));
    startTransition(async () => {
      const result = await moveTaskToProject(taskId, projectId);
      if (result.error) {
        toast.error(result.error);
        revertOverride(taskId);
      }
    });
  }

  function openEdit(task: TaskWithMeta) {
    if (justDragged.current) return;
    board.openEdit(task);
  }

  // Drops persist a real move only for these groupings.
  const canDrag =
    config.mode === "kanban" &&
    (config.groupBy === "status" || config.groupBy === "project");

  function onDragStart(event: DragStartEvent) {
    setActiveTask((event.active.data.current?.task as TaskWithMeta) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    const task = activeTask;
    setActiveTask(null);
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 100);

    const overKey = event.over?.id;
    if (!task || typeof overKey !== "string") return;

    if (config.groupBy === "status") {
      const status = overKey as TaskStatus;
      if (status !== task.status) changeStatus(task.id, status);
    } else if (config.groupBy === "project") {
      const projectId = overKey === "none" ? null : overKey;
      if (projectId !== task.projectId) moveProject(task.id, projectId);
    }
  }

  const showProject = !scopedProjectId && config.groupBy !== "project";

  if (filteredTasks.length === 0 && config.mode === "list") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {tasks.length > 0
            ? "No tasks match the current filters."
            : "No tasks yet. Create your first one."}
        </p>
        {tasks.length === 0 ? (
          <Button size="sm" variant="outline" onClick={board.openCreate}>
            <Plus />
            New task
          </Button>
        ) : null}
      </div>
    );
  }

  if (config.mode === "list") {
    return (
      <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
        {groups.map((group) => (
          <section key={group.key}>
            {config.groupBy !== "none" ? (
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
                    showProject={showProject}
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
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 pb-6 pt-4">
        {groups.map((group) => (
          <KanbanColumn
            key={group.key}
            group={group}
            droppable={canDrag}
            dragging={activeTask !== null}
          >
            {group.tasks.map((task) => (
              <DraggableTaskCard
                key={`${group.key}-${task.id}`}
                dragId={`${group.key}::${task.id}`}
                task={task}
                showProject={showProject}
                draggable={canDrag}
                onOpen={() => openEdit(task)}
              />
            ))}
          </KanbanColumn>
        ))}
      </div>
      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.2, 0.8, 0.35, 1)",
        }}
      >
        {activeTask ? (
          <div className="rotate-2 cursor-grabbing">
            <TaskCard
              task={activeTask}
              showProject={showProject}
              className="shadow-lg ring-1 ring-border"
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  group,
  droppable,
  dragging,
  children,
}: {
  group: Group;
  droppable: boolean;
  dragging: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: group.key,
    disabled: !droppable,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 transition-all duration-150",
        dragging && droppable && "ring-1 ring-border",
        isOver && "bg-accent ring-2 ring-ring/40",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-sm font-medium">{group.label}</span>
        <span className="text-xs text-muted-foreground">
          {group.tasks.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 pt-0">
        {children}
      </div>
    </div>
  );
}

function DraggableTaskCard({
  dragId,
  task,
  showProject,
  draggable,
  onOpen,
}: {
  dragId: string;
  task: TaskWithMeta;
  showProject: boolean;
  draggable: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: dragId,
    data: { task },
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "touch-none outline-none",
        draggable && "cursor-grab",
        isDragging && "opacity-40",
      )}
      onClick={onOpen}
    >
      <TaskCard task={task} showProject={showProject} />
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
  className,
}: {
  task: TaskWithMeta;
  showProject: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-xs select-none",
        className,
      )}
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
