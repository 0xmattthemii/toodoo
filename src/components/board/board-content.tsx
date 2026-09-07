"use client";

import {
  DragOverlay,
  useDndMonitor,
  useDraggable,
  useDroppable,
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

import { moveTaskToProject, reorderTasks, setTaskDone } from "@/actions/tasks";
import { useBoard } from "@/components/board/board-context";
import { DragHandle, type DragHandleProps } from "@/components/drag-handle";
import {
  sidebarProjectFromDropId,
  taskDropId,
  taskFromDropId,
  useTaskDnd,
} from "@/components/task-dnd";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { tryAction } from "@/lib/action";
import {
  moveItem,
  positionSlots,
  previewShifts,
  rowPitch,
} from "@/lib/ordering";
import { cn } from "@/lib/utils";
import type {
  BoardFilter,
  Person,
  ProjectSummary,
  SortBy,
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

/** Newest first, then by id — the tie-break under every sort, so that equal
 * values never leave two tasks swapping places between renders. */
function compareNewest(a: TaskWithMeta, b: TaskWithMeta) {
  const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

function compareTasks(a: TaskWithMeta, b: TaskWithMeta, sortBy: SortBy) {
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
      const byDeadline =
        new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      return byDeadline !== 0 ? byDeadline : compareNewest(a, b);
    }
    case "created":
      return compareNewest(a, b);
    default:
      return a.position - b.position || compareNewest(a, b);
  }
}

type Group = { key: string; label: string; tasks: TaskWithMeta[] };

/** The overlay renders a real row/card, but nothing on it is interactive. */
const noop = () => {};

export function BoardContent({
  tasks,
  projects,
  people,
  dialogProjects,
}: {
  tasks: TaskWithMeta[];
  projects: ProjectSummary[];
  people: Person[];
  /** Projects offered in the task dialog; defaults to `projects`. On project
   * pages this carries the user's full list so a task can be moved elsewhere. */
  dialogProjects?: ProjectSummary[];
}) {
  const board = useBoard();
  const {
    config,
    currentUserId,
    scopedProjectId,
    registerOptions,
    setSortBy,
    showDone,
  } = board;

  const projectOptions = dialogProjects ?? projects;

  // Feed dropdown options (filter values, task dialog selects) to the toolbar.
  useEffect(() => {
    registerOptions({ projects: projectOptions, people });
  }, [registerOptions, projectOptions, people]);

  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<TaskWithMeta>>
  >({});
  const { activeTask, activeGroupKey, overId, didJustDrag, registerDropHandler } =
    useTaskDnd();
  const [, startTransition] = useTransition();

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
    return effective
      .filter(
        (task) =>
          (showDone || !task.done) &&
          config.filters.every((filter) =>
            matchesFilter(task, filter, currentUserId),
          ),
      )
      .sort((a, b) => compareTasks(a, b, config.sortBy));
  }, [
    tasks,
    taskOverrides,
    config.filters,
    config.sortBy,
    currentUserId,
    showDone,
  ]);

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

  const revertOverride = useCallback((taskId: string) => {
    setTaskOverrides((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }, []);

  function changeDone(taskId: string, done: boolean) {
    setTaskOverrides((current) => ({
      ...current,
      [taskId]: { ...current[taskId], done },
    }));
    startTransition(async () => {
      const result = await tryAction(setTaskDone(taskId, done), {
        error: "Could not update the task",
      });
      if (result.error) {
        toast.error(result.error);
        revertOverride(taskId);
      }
    });
  }

  const moveProject = useCallback(
    (taskId: string, projectId: string | null) => {
      const projectName = projectId
        ? (projectOptions.find((project) => project.id === projectId)?.name ??
          null)
        : null;
      setTaskOverrides((current) => ({
        ...current,
        [taskId]: { ...current[taskId], projectId, projectName },
      }));
      startTransition(async () => {
        const result = await tryAction(moveTaskToProject(taskId, projectId), {
          error: "Could not move the task",
        });
        if (result.error) {
          toast.error(result.error);
          revertOverride(taskId);
        }
      });
    },
    [projectOptions, revertOverride, startTransition],
  );

  /**
   * Drops the dragged task where the one it landed on sits, within a single
   * group. Only the group's own tasks are renumbered, and only into the
   * position slots they already occupy, so the rest of the board stays put.
   * Whatever the board was sorted by, the order the user now sees is the one
   * that gets saved — which is why this also switches the sort to manual.
   */
  const reorder = useCallback(
    (groupKey: string, taskId: string, targetTaskId: string) => {
      const group = groups.find((candidate) => candidate.key === groupKey);
      if (!group) return;
      const ids = group.tasks.map((task) => task.id);
      const from = ids.indexOf(taskId);
      const to = ids.indexOf(targetTaskId);
      if (from === -1 || to === -1 || from === to) return;

      const orderedIds = moveItem(ids, from, to);
      const slots = positionSlots(group.tasks.map((task) => task.position));

      setTaskOverrides((current) => {
        const next = { ...current };
        orderedIds.forEach((id, index) => {
          next[id] = { ...next[id], position: slots[index] };
        });
        return next;
      });
      setSortBy("manual");

      startTransition(async () => {
        const result = await tryAction(reorderTasks(orderedIds), {
          error: "Could not reorder the tasks",
        });
        if (result.error) {
          toast.error(result.error);
          setTaskOverrides((current) => {
            const next = { ...current };
            for (const id of orderedIds) {
              if (!next[id]) continue;
              const override = { ...next[id] };
              delete override.position;
              next[id] = override;
            }
            return next;
          });
        }
      });
    },
    [groups, setSortBy, startTransition],
  );

  function openEdit(task: TaskWithMeta) {
    if (didJustDrag()) return;
    board.openEdit(task);
  }

  // Tasks can always be dragged onto a project in the sidebar; kanban columns
  // only take drops when they *are* the projects.
  const canDropOnColumn = config.groupBy === "project";

  const onDrop = useCallback(
    (dropId: string | null, task: TaskWithMeta, fromGroupKey: string) => {
      if (!dropId) return;

      const sidebarProjectId = sidebarProjectFromDropId(dropId);
      if (sidebarProjectId !== null) {
        if (sidebarProjectId !== task.projectId) {
          moveProject(task.id, sidebarProjectId);
        }
        return;
      }

      // Landing on another task reorders within a group, and outside it means
      // the same as landing on that task's column.
      const target = taskFromDropId(dropId);
      const targetGroupKey = target ? target.groupKey : dropId;
      if (target && target.groupKey === fromGroupKey) {
        reorder(fromGroupKey, task.id, target.taskId);
        return;
      }

      if (config.groupBy === "project") {
        const projectId = targetGroupKey === "none" ? null : targetGroupKey;
        if (projectId !== task.projectId) moveProject(task.id, projectId);
      }
    },
    [config.groupBy, moveProject, reorder],
  );

  useEffect(() => {
    registerDropHandler(onDrop);
    return () => registerDropHandler(null);
  }, [registerDropHandler, onDrop]);

  const showProject = !scopedProjectId && config.groupBy !== "project";

  // The group under the pointer, whether the pointer is over the column itself
  // or over one of its tasks.
  const overTask = overId ? taskFromDropId(overId) : null;
  const overGroupKey = overTask ? overTask.groupKey : overId;

  if (filteredTasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {tasks.length > 0
            ? "No tasks match the current filters."
            : "No tasks yet. Create your first one."}
        </p>
        {tasks.length === 0 ? (
          <Button variant="outline" onClick={board.openCreate}>
            <Plus />
            New task
          </Button>
        ) : null}
      </div>
    );
  }

  // What follows the cursor is the very component that was grabbed, with the
  // same props — the overlay inherits the source's measured box, so anything
  // else would reflow its contents inside it at the moment of the grab. It is
  // translucent so the column or sidebar project underneath stays readable,
  // `inert` because it is a visual clone: it keeps a second copy of the task
  // out of the accessibility tree and the tab order (which pointer-events
  // alone would not). Drop targets are resolved from pointer coordinates, not
  // hit-testing, so dnd-kit's own positioned wrapper swallowing the pointer
  // costs nothing — `pointer-events-none` just says so for the content too.
  const dragOverlay = (
    <DragOverlay
      dropAnimation={{
        duration: 200,
        easing: "cubic-bezier(0.2, 0.8, 0.35, 1)",
      }}
    >
      {activeTask ? (
        <div inert className="pointer-events-none cursor-grabbing opacity-80">
          {config.mode === "list" ? (
            <TaskRow
              task={activeTask}
              showProject={showProject}
              onToggleDone={noop}
              className="shadow-lg ring-1 ring-border"
            />
          ) : (
            <TaskCard
              task={activeTask}
              showProject={showProject}
              onToggleDone={noop}
              className="shadow-lg ring-1 ring-border"
            />
          )}
        </div>
      ) : null}
    </DragOverlay>
  );

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
              <GroupTasks
                group={group}
                showDone={showDone}
                onSetDone={changeDone}
                onOpen={openEdit}
                render={(task, toggleDone, handle) => (
                  <TaskRow
                    task={task}
                    showProject={showProject}
                    onToggleDone={toggleDone}
                    handle={handle}
                  />
                )}
              />
            )}
          </section>
        ))}
        {dragOverlay}
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 pb-6 pt-4">
        {groups.map((group) => (
          <KanbanColumn
            key={group.key}
            group={group}
            droppable={canDropOnColumn}
            dragging={activeTask !== null}
            highlight={
              overGroupKey === group.key && activeGroupKey !== group.key
            }
          >
            <GroupTasks
              group={group}
              showDone={showDone}
              onSetDone={changeDone}
              onOpen={openEdit}
              render={(task, toggleDone, handle) => (
                <TaskCard
                  task={task}
                  showProject={showProject}
                  onToggleDone={toggleDone}
                  handle={handle}
                />
              )}
            />
          </KanbanColumn>
        ))}
      </div>
      {dragOverlay}
    </>
  );
}

/**
 * One group's tasks: draggable, droppable, and previewing a reorder. While a
 * task from this group hovers another, the rows slide into the order the drop
 * would produce (see `previewShifts`, which mirrors `reorder`).
 */
function GroupTasks({
  group,
  showDone,
  onSetDone,
  onOpen,
  render,
}: {
  group: Group;
  showDone: boolean;
  onSetDone: (taskId: string, done: boolean) => void;
  onOpen: (task: TaskWithMeta) => void;
  render: (
    task: TaskWithMeta,
    toggleDone: (done: boolean) => void,
    handle: DragHandleProps,
  ) => React.ReactNode;
}) {
  const { activeTask, activeGroupKey, overId } = useTaskDnd();
  const container = useRef<HTMLDivElement>(null);
  const [pitch, setPitch] = useState(0);

  // Measured as a drag starts — only by the group the task came from, since
  // a task can only be reordered within it.
  useDndMonitor({
    onDragStart(event) {
      const data = event.active.data.current as
        | { kind?: string; groupKey?: string }
        | undefined;
      if (data?.kind !== "task" || data.groupKey !== group.key) return;
      setPitch(rowPitch(container.current));
    },
  });

  const inGroup = activeGroupKey === group.key;
  const overTask = overId ? taskFromDropId(overId) : null;
  const shiftFor = previewShifts(
    group.tasks.map((task) => task.id),
    inGroup && activeTask ? activeTask.id : null,
    inGroup && overTask?.groupKey === group.key ? overTask.taskId : null,
    pitch,
  );

  return (
    <div ref={container} className="flex flex-col">
      {group.tasks.map((task, index) => (
        <TaskLeaveWrapper
          key={task.id}
          task={task}
          showDone={showDone}
          onSetDone={onSetDone}
          shift={shiftFor(task.id, index)}
          animateShift={activeTask !== null}
        >
          {(displayTask, toggleDone) => (
            <DraggableTask
              groupKey={group.key}
              task={displayTask}
              onOpen={() => onOpen(displayTask)}
            >
              {(handle) => render(displayTask, toggleDone, handle)}
            </DraggableTask>
          )}
        </TaskLeaveWrapper>
      ))}
    </div>
  );
}

function KanbanColumn({
  group,
  droppable,
  dragging,
  highlight,
  children,
}: {
  group: Group;
  droppable: boolean;
  dragging: boolean;
  /** True while a drop here would move the task into this column. */
  highlight: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: group.key,
    disabled: !droppable,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 transition-all duration-150",
        dragging && droppable && "ring-1 ring-border",
        droppable && highlight && "bg-accent ring-2 ring-ring/40",
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

/**
 * Makes a card or row draggable, droppable and clickable. Only its grip starts
 * a drag — the rest of the row opens the task — and dragging is always on:
 * even with no droppable column, its neighbours accept the drop as a reorder
 * and the sidebar's projects accept it as a move.
 */
function DraggableTask({
  groupKey,
  task,
  onOpen,
  children,
}: {
  groupKey: string;
  task: TaskWithMeta;
  onOpen: () => void;
  children: (handle: DragHandleProps) => React.ReactNode;
}) {
  const { activeTask } = useTaskDnd();
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: `${groupKey}::${task.id}`,
    data: { kind: "task", task, groupKey },
  });
  // Only a task can be dropped on a task, so the target is dead weight until
  // one is in the air.
  const { setNodeRef: setDropRef } = useDroppable({
    id: taskDropId(groupKey, task.id),
    disabled: !activeTask,
  });

  return (
    <div ref={setDropRef}>
      <div
        ref={setNodeRef}
        className={cn(isDragging && "opacity-30")}
        onClick={onOpen}
      >
        {children({ ref: setActivatorNodeRef, listeners, attributes })}
      </div>
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
  shift,
  animateShift,
  children,
}: {
  task: TaskWithMeta;
  showDone: boolean;
  onSetDone: (taskId: string, done: boolean) => void;
  /** Pixels to slide by while a reorder is previewed. */
  shift: number;
  /** Only while a task is in the air: on the drop, the DOM reorders and the
   * offsets vanish in the same render, and animating that would slide every
   * row back to where it already is. */
  animateShift: boolean;
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
    <div
      ref={ref}
      style={{ transform: shift ? `translateY(${shift}px)` : undefined }}
      className={cn(
        "overflow-hidden",
        animateShift && "transition-transform duration-150",
      )}
    >
      <div className="pb-2">
        {/* eslint-disable-next-line react-hooks/refs -- toggleDone only touches refs when invoked as an event handler, not during render */}
        {children(localDone ? { ...task, done: true } : task, toggleDone)}
      </div>
    </div>
  );
}

/**
 * The checkbox and the space around it. Clicking anywhere in that zone toggles
 * the task, so the target is bigger than the 16px box; the checkbox itself
 * still handles its own click (and keyboard), so only clicks on the padding
 * are turned into toggles here.
 */
function DoneCheckbox({
  task,
  onToggleDone,
  className,
}: {
  task: TaskWithMeta;
  onToggleDone: (done: boolean) => void;
  className?: string;
}) {
  return (
    <span
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onToggleDone(!task.done);
      }}
      className={cn("flex cursor-pointer items-center", className)}
    >
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

function DeadlineChip({
  task,
  placeholder,
}: {
  task: TaskWithMeta;
  /** Render "No date" instead of nothing, so the slot never collapses. */
  placeholder?: boolean;
}) {
  if (!task.deadline) {
    if (!placeholder) return null;
    return (
      <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground/50">
        <CalendarClock className="size-3.5" />
        No date
      </span>
    );
  }
  const overdue = dueBucket(task) === "overdue" && !task.done;
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
  className,
  onToggleDone,
  handle,
}: {
  task: TaskWithMeta;
  showProject: boolean;
  className?: string;
  onToggleDone: (done: boolean) => void;
  /** Omitted on the drag overlay, which shows a static grip. */
  handle?: DragHandleProps;
}) {
  return (
    <div
      className={cn(
        "group/row flex w-full items-center gap-3 rounded-lg border bg-background py-3 pr-4 pl-1.5 text-left hover:bg-muted/50",
        className,
      )}
    >
      <DragHandle
        handle={handle}
        label={`Drag "${task.title}"`}
        className={cn(!handle && "opacity-100")}
      />
      {/* Negative margins grow the click zone to the row's full height and
          across the gaps on both sides; the left one also pulls the box
          closer to the grip than the row's gap would. */}
      <DoneCheckbox
        task={task}
        onToggleDone={onToggleDone}
        className="-my-3 -ml-3 -mr-3 self-stretch py-3 pr-3 pl-1.5"
      />
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
      <span className="flex w-16 items-center justify-end">
        <DeadlineChip task={task} />
      </span>
      <AvatarStack people={task.assignees} />
    </div>
  );
}

/**
 * Kanban card. Every slot renders whether or not the task fills it — project
 * top right, date bottom left, assignees bottom right — so cards in a column
 * line up identically whatever data they carry.
 */
function TaskCard({
  task,
  showProject,
  className,
  onToggleDone,
  handle,
}: {
  task: TaskWithMeta;
  showProject: boolean;
  className?: string;
  onToggleDone: (done: boolean) => void;
  /** Omitted on the drag overlay, which shows a static grip. */
  handle?: DragHandleProps;
}) {
  return (
    <div
      className={cn(
        "group/row flex items-start gap-2.5 rounded-lg border bg-background py-3.5 pr-4 pl-1.5 shadow-xs select-none",
        className,
      )}
    >
      <DragHandle
        handle={handle}
        label={`Drag "${task.title}"`}
        className={cn("-my-0.5", !handle && "opacity-100")}
      />
      {/* Stretches the click zone down the card's left edge and across the
          gaps on both sides. */}
      <DoneCheckbox
        task={task}
        onToggleDone={onToggleDone}
        className="-my-3.5 -ml-2.5 -mr-2.5 items-start self-stretch py-3.5 pr-2.5 pl-1.5 [&>*]:mt-0.5"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              task.done && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
          {showProject ? (
            <Badge
              variant="outline"
              className={cn("max-w-28", !task.projectName && "invisible")}
            >
              <span className="truncate">{task.projectName ?? "—"}</span>
            </Badge>
          ) : null}
        </span>
        {/* Fixed height: an avatar is taller than the date's text line, and
            the card must not grow when someone is assigned. */}
        <span className="flex h-5 items-center gap-2">
          <DeadlineChip task={task} placeholder />
          <span className="ml-auto">
            <AvatarStack people={task.assignees} />
          </span>
        </span>
      </span>
    </div>
  );
}
