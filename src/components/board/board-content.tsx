"use client";

import {
  DragOverlay,
  useDndMonitor,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  moveTaskToProject,
  reorderTasks,
  setTaskDeadline,
  setTaskDone,
} from "@/actions/tasks";
import { useBoard } from "@/components/board/board-context";
import { CalendarView } from "@/components/board/calendar-view";
import { dueBucket, groupTasks, type Group } from "@/components/board/grouping";
import { TaskCard, TaskRow } from "@/components/board/task-items";
import type { DragHandleProps } from "@/components/drag-handle";
import {
  calendarDayFromDropId,
  sidebarProjectFromDropId,
  taskDropId,
  taskFromDropId,
  taskGroupFromTailDropId,
  taskGroupTailDropId,
  UNSCHEDULED_DROP_ID,
  useTaskDnd,
} from "@/components/task-dnd";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  moveItem,
  positionSlots,
  previewShifts,
  rowPitch,
} from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { patchTask, setTaskPositions } from "@/lib/workspace";
import type {
  BoardFilter,
  Person,
  ProjectSummary,
  SortBy,
  TaskWithMeta,
} from "@/lib/types";

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
  const { config, currentUserId, scopedProjectId, setSortBy, showDone } =
    board;
  const { mutate, membersOf, projectsById, tasks: allTasks } = useWorkspace();

  const projectOptions = dialogProjects ?? projects;

  const { activeTask, activeGroupKey, overId, didJustDrag, registerDropHandler } =
    useTaskDnd();

  const filteredTasks = useMemo(
    () =>
      tasks
        .filter(
        (task) =>
          (showDone || !task.done) &&
          config.filters.every((filter) =>
            matchesFilter(task, filter, currentUserId),
          ),
        )
        .sort((a, b) => compareTasks(a, b, config.sortBy)),
    [tasks, config.filters, config.sortBy, currentUserId, showDone],
  );

  const { setVisibleCount } = board;
  useEffect(() => {
    setVisibleCount(filteredTasks.length);
  }, [setVisibleCount, filteredTasks.length]);

  const groups = useMemo(
    () =>
      groupTasks(filteredTasks, config.groupBy, {
        projects,
        people,
        scopedProjectId,
      }),
    [filteredTasks, config.groupBy, projects, people, scopedProjectId],
  );

  // Both changes show at once and are undone (with a toast) if the server
  // refuses them.
  const changeDone = useCallback(
    (taskId: string, done: boolean) => {
      void mutate({
        optimistic: patchTask(taskId, { done }),
        action: () => setTaskDone(taskId, done),
        failure: "Could not update the task",
      });
    },
    [mutate],
  );

  const moveProject = useCallback(
    (taskId: string, projectId: string | null) => {
      const projectName = projectId
        ? (projectOptions.find((project) => project.id === projectId)?.name ??
          null)
        : null;
      // Moving into a project unassigns whoever isn't in it, as the server does.
      const assignees = allTasks.find((task) => task.id === taskId)?.assignees;
      const members = projectId ? membersOf(projectId) : null;
      const patch =
        members && assignees
          ? {
              projectId,
              projectName,
              assignees: assignees.filter((person) =>
                members.some((member) => member.id === person.id),
              ),
            }
          : { projectId, projectName };
      void mutate({
        optimistic: patchTask(taskId, patch),
        action: () => moveTaskToProject(taskId, projectId),
        failure: "Could not move the task",
      });
    },
    [projectOptions, mutate, membersOf, allTasks],
  );

  const changeDeadline = useCallback(
    (taskId: string, deadline: string | null) => {
      void mutate({
        optimistic: patchTask(taskId, { deadline }),
        action: () => setTaskDeadline(taskId, deadline),
        failure: "Could not reschedule the task",
      });
    },
    [mutate],
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
      const positions = Object.fromEntries(
        orderedIds.map((id, index) => [id, slots[index]]),
      );

      setSortBy("manual");
      void mutate({
        optimistic: setTaskPositions(positions),
        action: () => reorderTasks(orderedIds),
        failure: "Could not reorder the tasks",
        retry: true,
      });
    },
    [groups, setSortBy, mutate],
  );

  /** A group's tail stands for its last task; null when the group is empty. */
  const tailTarget = useCallback(
    (groupKey: string) => {
      const last = groups.find((group) => group.key === groupKey)?.tasks.at(-1);
      return last ? { groupKey, taskId: last.id } : null;
    },
    [groups],
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

      // On the calendar a day sets the deadline, and the "No date" panel
      // clears it.
      const day =
        dropId === UNSCHEDULED_DROP_ID ? null : calendarDayFromDropId(dropId);
      if (day !== null || dropId === UNSCHEDULED_DROP_ID) {
        if (day !== task.deadline) changeDeadline(task.id, day);
        return;
      }

      // Landing on another task reorders within a group, and outside it means
      // the same as landing on that task's column. The space after a group's
      // last task (list view) counts as landing on that last task.
      const tailGroupKey = taskGroupFromTailDropId(dropId);
      const target =
        tailGroupKey !== null
          ? tailTarget(tailGroupKey)
          : taskFromDropId(dropId);
      const targetGroupKey = target
        ? target.groupKey
        : (tailGroupKey ?? dropId);
      if (target && target.groupKey === fromGroupKey) {
        reorder(fromGroupKey, task.id, target.taskId);
        return;
      }

      if (config.groupBy === "project") {
        const projectId = targetGroupKey === "none" ? null : targetGroupKey;
        if (projectId !== task.projectId) moveProject(task.id, projectId);
      }
    },
    [config.groupBy, moveProject, reorder, tailTarget, changeDeadline],
  );

  useEffect(() => {
    registerDropHandler(onDrop);
    return () => registerDropHandler(null);
  }, [registerDropHandler, onDrop]);

  const showProject = !scopedProjectId && config.groupBy !== "project";
  const colorOf = (task: TaskWithMeta) =>
    (task.projectId && projectsById.get(task.projectId)?.color) || null;
  // Grouped by project, each group's heading carries its project's color.
  const dotOf = (group: Group) =>
    config.groupBy === "project" && group.key !== "none"
      ? (projectsById.get(group.key)?.color ?? null)
      : undefined;

  // The group under the pointer, whether the pointer is over the column itself
  // or over one of its tasks.
  const overTask = overId ? taskFromDropId(overId) : null;
  const overGroupKey = overTask
    ? overTask.groupKey
    : overId
      ? (taskGroupFromTailDropId(overId) ?? overId)
      : null;

  if (config.mode === "calendar") {
    return (
      <CalendarView
        tasks={filteredTasks}
        showDone={showDone}
        onSetDone={changeDone}
        onOpen={openEdit}
        onCreate={(deadline) =>
          board.openCreate(deadline ? { deadline } : undefined)
        }
        neutral={Boolean(scopedProjectId)}
      />
    );
  }

  if (filteredTasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {tasks.length > 0
            ? "No tasks match the current filters."
            : "No tasks yet. Create your first one."}
        </p>
        {tasks.length === 0 ? (
          <Button variant="outline" onClick={() => board.openCreate()}>
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
              projectColor={colorOf(activeTask)}
              onToggleDone={noop}
              className="shadow-lg ring-1 ring-border"
            />
          ) : (
            <TaskCard
              task={activeTask}
              showProject={showProject}
              projectColor={colorOf(activeTask)}
              onToggleDone={noop}
              className="shadow-lg ring-1 ring-border"
            />
          )}
        </div>
      ) : null}
    </DragOverlay>
  );

  if (config.mode === "list") {
    // Each group ends in a droppable tail: the gap to the next group, and for
    // the last group the rest of the view — so the list fills the page and a
    // task dragged past the last row still lands (at the end of the group).
    const lastIndex = groups.length - 1;
    return (
      <div className="flex flex-1 flex-col px-6 pt-4">
        {groups.map((group, index) => (
          <section
            key={group.key}
            className={cn("flex flex-col", index === lastIndex && "flex-1")}
          >
            {config.groupBy !== "none" ? (
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <GroupDot color={dotOf(group)} />
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
                    projectColor={colorOf(task)}
                    onToggleDone={toggleDone}
                    handle={handle}
                  />
                )}
              />
            )}
            <GroupTail groupKey={group.key} grow={index === lastIndex} />
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
            dot={dotOf(group)}
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
                  projectColor={colorOf(task)}
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
  // Hovering the group's tail previews the same order as hovering its last
  // row — which is what a drop there does.
  const overTaskId =
    overTask?.groupKey === group.key
      ? overTask.taskId
      : overId && taskGroupFromTailDropId(overId) === group.key
        ? (group.tasks.at(-1)?.id ?? null)
        : null;
  const shiftFor = previewShifts(
    group.tasks.map((task) => task.id),
    inGroup && activeTask ? activeTask.id : null,
    inGroup ? overTaskId : null,
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

/**
 * The space after a group's rows in the list view: the gap to the next group,
 * or everything down to the bottom of the view for the last group. Dropping a
 * task on it puts the task at the end of the group (see `tailTarget`). The
 * spacing it provides replaces what used to be the list's gap and padding.
 */
function GroupTail({ groupKey, grow }: { groupKey: string; grow: boolean }) {
  const { activeTask } = useTaskDnd();
  // Only a task can be dropped here, so the target is dead weight until one
  // is in the air.
  const { setNodeRef } = useDroppable({
    id: taskGroupTailDropId(groupKey),
    disabled: !activeTask,
  });
  return (
    <div
      ref={setNodeRef}
      aria-hidden
      className={cn("min-h-6", grow && "flex-1")}
    />
  );
}

/**
 * The colored dot before a project group's name. `undefined` draws nothing
 * (the board isn't grouped by project, or this is "No project"); `null` is a
 * project without a color.
 */
function GroupDot({ color }: { color: string | null | undefined }) {
  if (color === undefined) return null;
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

function KanbanColumn({
  group,
  dot,
  droppable,
  dragging,
  highlight,
  children,
}: {
  group: Group;
  dot: string | null | undefined;
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
        // Columns share the width, never narrower than a readable card nor so
        // wide that a lone column turns into a list.
        "flex max-w-[34rem] min-w-88 flex-1 basis-88 flex-col rounded-xl bg-muted/50 transition-all duration-150",
        dragging && droppable && "ring-1 ring-border",
        droppable && highlight && "bg-accent ring-2 ring-ring/40",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GroupDot color={dot} />
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
