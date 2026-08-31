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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { moveTaskToProject, setTaskDone } from "@/actions/tasks";
import { useBoard } from "@/components/board/board-context";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type {
  BoardFilter,
  Person,
  ProjectSummary,
  TaskWithMeta,
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
  const { config, currentUserId, scopedProjectId, registerOptions, showDone } =
    board;

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
    return effective.filter(
      (task) =>
        (showDone || !task.done) &&
        config.filters.every((filter) =>
          matchesFilter(task, filter, currentUserId),
        ),
    );
  }, [tasks, taskOverrides, config.filters, currentUserId, showDone]);

  const groups = useMemo<Group[]>(() => {
    const list = filteredTasks;
    switch (config.groupBy) {
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

  function changeDone(taskId: string, done: boolean) {
    setTaskOverrides((current) => ({
      ...current,
      [taskId]: { ...current[taskId], done },
    }));
    startTransition(async () => {
      const result = await setTaskDone(taskId, done);
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

  // Drops persist a real move only when grouping by project.
  const canDrag = config.mode === "kanban" && config.groupBy === "project";

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

    if (config.groupBy === "project") {
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
            {group.tasks.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-center text-sm text-muted-foreground/70">
                No tasks
              </p>
            ) : (
              <div className="flex flex-col">
                {group.tasks.map((task) => (
                  <TaskLeaveWrapper
                    key={`${group.key}-${task.id}`}
                    task={task}
                    showDone={showDone}
                    onSetDone={changeDone}
                  >
                    {(displayTask, toggleDone) => (
                      <TaskRow
                        task={displayTask}
                        showProject={showProject}
                        onOpen={() => openEdit(displayTask)}
                        onToggleDone={toggleDone}
                      />
                    )}
                  </TaskLeaveWrapper>
                ))}
              </div>
            )}
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
              <TaskLeaveWrapper
                key={`${group.key}-${task.id}`}
                task={task}
                showDone={showDone}
                onSetDone={changeDone}
              >
                {(displayTask, toggleDone) => (
                  <DraggableTaskCard
                    dragId={`${group.key}::${task.id}`}
                    task={displayTask}
                    showProject={showProject}
                    draggable={canDrag}
                    onOpen={() => openEdit(displayTask)}
                    onToggleDone={toggleDone}
                  />
                )}
              </TaskLeaveWrapper>
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
      <div className="flex flex-1 flex-col overflow-y-auto p-2 pt-0">
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
  onToggleDone,
}: {
  dragId: string;
  task: TaskWithMeta;
  showProject: boolean;
  draggable: boolean;
  onOpen: () => void;
  onToggleDone: (done: boolean) => void;
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
      <TaskCard
        task={task}
        showProject={showProject}
        onToggleDone={onToggleDone}
      />
    </div>
  );
}

/**
 * Runs the completion exit animation entirely inside the row: the checked
 * state renders from local state (no board re-render), then the row height
 * collapses via the Web Animations API, and only once it is invisible does
 * the parent persist the change and unmount it. The bottom padding replaces
 * the list gap so spacing collapses along with the row.
 */
function TaskLeaveWrapper({
  task,
  showDone,
  onSetDone,
  children,
}: {
  task: TaskWithMeta;
  showDone: boolean;
  onSetDone: (taskId: string, done: boolean) => void;
  children: (
    task: TaskWithMeta,
    toggleDone: (done: boolean) => void,
  ) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const beatTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localDone, setLocalDone] = useState(false);

  const toggleDone = useCallback(
    (done: boolean) => {
      if (beatTimeout.current) {
        clearTimeout(beatTimeout.current);
        beatTimeout.current = null;
      }
      if (!done || showDone) {
        setLocalDone(false);
        onSetDone(task.id, done);
        return;
      }
      // Show the checked state for a beat, then collapse and persist.
      setLocalDone(true);
      beatTimeout.current = setTimeout(() => {
        beatTimeout.current = null;
        const el = ref.current;
        if (!el) {
          onSetDone(task.id, true);
          return;
        }
        const animation = el.animate(
          [
            { height: `${el.offsetHeight}px`, opacity: 1, transform: "none" },
            { height: "0px", opacity: 0, transform: "translateX(-8px)" },
          ],
          {
            duration: 200,
            easing: "cubic-bezier(0.4, 0, 0.2, 1)",
            fill: "forwards",
          },
        );
        animation.onfinish = () => onSetDone(task.id, true);
      }, 300);
    },
    [showDone, onSetDone, task.id],
  );

  return (
    <div ref={ref} className="overflow-hidden">
      <div className="pb-2">
        {/* eslint-disable-next-line react-hooks/refs -- toggleDone only touches refs when invoked as an event handler, not during render */}
        {children(localDone ? { ...task, done: true } : task, toggleDone)}
      </div>
    </div>
  );
}

function DoneCheckbox({
  task,
  onToggleDone,
}: {
  task: TaskWithMeta;
  onToggleDone: (done: boolean) => void;
}) {
  return (
    <span onClick={(event) => event.stopPropagation()} className="flex">
      <Checkbox
        checked={task.done}
        onCheckedChange={(checked) => onToggleDone(checked === true)}
        className={cn(
          "rounded-full transition-transform active:scale-90",
          task.done && "animate-in zoom-in-75 duration-300",
        )}
        aria-label={`Mark "${task.title}" as ${task.done ? "not done" : "done"}`}
      />
    </span>
  );
}

function DeadlineChip({ task }: { task: TaskWithMeta }) {
  if (!task.deadline) {
    return <span className="w-16" aria-hidden />;
  }
  const overdue = dueBucket(task) === "overdue" && !task.done;
  return (
    <span
      className={cn(
        "flex w-16 items-center justify-end gap-1 text-xs whitespace-nowrap",
        overdue ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      <CalendarClock className="size-3.5" />
      {format(new Date(task.deadline), "MMM d")}
    </span>
  );
}

function AvatarStack({ people }: { people: Person[] }) {
  return (
    <span className="flex w-14 justify-end -space-x-1.5">
      {people.slice(0, 2).map((person) => (
        <UserAvatar
          key={person.id}
          person={person}
          className="size-5 ring-2 ring-background"
        />
      ))}
      {people.length > 2 ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-background">
          +{people.length - 2}
        </span>
      ) : null}
    </span>
  );
}

function TaskRow({
  task,
  showProject,
  onOpen,
  onToggleDone,
}: {
  task: TaskWithMeta;
  showProject: boolean;
  onOpen: () => void;
  onToggleDone: (done: boolean) => void;
}) {
  return (
    <div
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left hover:bg-muted/50"
      onClick={onOpen}
    >
      <DoneCheckbox task={task} onToggleDone={onToggleDone} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          task.done && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>
      {showProject ? (
        <span className="flex w-36 justify-end">
          {task.projectName ? (
            <Badge variant="outline" className="max-w-36">
              <span className="truncate">{task.projectName}</span>
            </Badge>
          ) : null}
        </span>
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
  onToggleDone,
}: {
  task: TaskWithMeta;
  showProject: boolean;
  className?: string;
  onToggleDone?: (done: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-xs select-none",
        className,
      )}
    >
      <span className="flex items-start gap-2.5">
        {onToggleDone ? (
          <DoneCheckbox task={task} onToggleDone={onToggleDone} />
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 text-sm font-medium",
            task.done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </span>
      </span>
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
    </div>
  );
}
