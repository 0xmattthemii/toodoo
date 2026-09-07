"use client";

import {
  DndContext,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { TaskWithMeta } from "@/lib/types";

const SIDEBAR_PROJECT_PREFIX = "sidebar-project:";
const TASK_PREFIX = "task:";
const TAIL_PREFIX = "task-tail:";

/** Droppable id for a project row in the sidebar. */
export function sidebarProjectDropId(projectId: string) {
  return `${SIDEBAR_PROJECT_PREFIX}${projectId}`;
}

/** The project a drop id refers to, or null if it isn't a sidebar row. */
export function sidebarProjectFromDropId(dropId: string) {
  return dropId.startsWith(SIDEBAR_PROJECT_PREFIX)
    ? dropId.slice(SIDEBAR_PROJECT_PREFIX.length)
    : null;
}

/** Draggable id for a project row in the sidebar. */
export function projectDragId(projectId: string) {
  return `drag-project:${projectId}`;
}

/**
 * Droppable id for a task on the board. A task belongs to a board group, and
 * the group is what tells a drop apart: onto a task in the same group it is a
 * reorder, onto one in another group it means whatever the grouping means.
 */
export function taskDropId(groupKey: string, taskId: string) {
  return `${TASK_PREFIX}${groupKey}::${taskId}`;
}

/** The group and task a drop id refers to, or null if it isn't a task. */
export function taskFromDropId(dropId: string) {
  if (!dropId.startsWith(TASK_PREFIX)) return null;
  const separator = dropId.indexOf("::");
  if (separator === -1) return null;
  return {
    groupKey: dropId.slice(TASK_PREFIX.length, separator),
    taskId: dropId.slice(separator + 2),
  };
}

/**
 * Droppable id for the space after a group's last task in the list view.
 * Dropping there means "the end of this group", so a drag past the last row
 * lands instead of being ignored.
 */
export function taskGroupTailDropId(groupKey: string) {
  return `${TAIL_PREFIX}${groupKey}`;
}

/** The group whose tail a drop id refers to, or null if it isn't a tail. */
export function taskGroupFromTailDropId(dropId: string) {
  return dropId.startsWith(TAIL_PREFIX)
    ? dropId.slice(TAIL_PREFIX.length)
    : null;
}

/** Called on every task drop, with a null id when it landed nowhere. */
type TaskDropHandler = (
  dropId: string | null,
  task: TaskWithMeta,
  fromGroupKey: string,
) => void;

/** Called on every project drop, with a null id when it landed nowhere. */
type ProjectDropHandler = (dropId: string | null, projectId: string) => void;

type TaskDndValue = {
  /** The task being dragged, for drop targets and the drag overlay. */
  activeTask: TaskWithMeta | null;
  /** The board group the dragged task came from. */
  activeGroupKey: string | null;
  /** The sidebar project being dragged, if this is a reorder. */
  activeProjectId: string | null;
  /** The droppable currently under the pointer, for drop indicators. */
  overId: string | null;
  /** True for a moment after a drag, so the click it ends with can be ignored. */
  didJustDrag: () => boolean;
  registerDropHandler: (handler: TaskDropHandler | null) => void;
  registerProjectDropHandler: (handler: ProjectDropHandler | null) => void;
};

const TaskDndContext = createContext<TaskDndValue | null>(null);

export function useTaskDnd() {
  const value = useContext(TaskDndContext);
  if (!value) {
    throw new Error("useTaskDnd must be used inside <TaskDndProvider>");
  }
  return value;
}

/**
 * Prefer whatever is under the pointer; fall back to rect overlap so a drop
 * near a kanban column's edge still lands. The fallback deliberately skips
 * rows — the sidebar's projects and the board's tasks — and the list view's
 * group tails. They are small (or, for a tail, right below rows), and the
 * drag overlay overlaps plenty of them long before the pointer gets there,
 * which would drop a task somewhere nobody pointed at.
 */
const collisionDetection: CollisionDetection = (args) => {
  const withPointer = pointerWithin(args);
  if (withPointer.length > 0) return withPointer;
  return rectIntersection({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) => {
      const id = String(container.id);
      return (
        sidebarProjectFromDropId(id) === null &&
        taskFromDropId(id) === null &&
        taskGroupFromTailDropId(id) === null
      );
    }),
  });
};

type ActiveDrag =
  | { kind: "task"; task: TaskWithMeta; groupKey: string }
  | { kind: "project"; projectId: string };

/**
 * One drag context around the whole app shell, so a task can be dropped on a
 * kanban column, on another task, or on a project in the sidebar — and so a
 * sidebar project can be dragged into a new place. It only tracks what is
 * being dragged; each surface registers what a drop there means, since it owns
 * the optimistic state and the server action.
 */
export function TaskDndProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const taskDropHandler = useRef<TaskDropHandler | null>(null);
  const projectDropHandler = useRef<ProjectDropHandler | null>(null);
  const dragEndedAt = useRef(0);

  const sensors = useSensors(
    // A small distance threshold keeps plain clicks opening the edit dialog
    // and plain clicks on a sidebar project navigating to it.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const registerDropHandler = useCallback((handler: TaskDropHandler | null) => {
    taskDropHandler.current = handler;
  }, []);
  const registerProjectDropHandler = useCallback(
    (handler: ProjectDropHandler | null) => {
      projectDropHandler.current = handler;
    },
    [],
  );

  // Keep the grabbing cursor for the whole drag (see globals.css): the overlay
  // that follows the pointer is inert, so it cannot carry the cursor itself.
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.dataset.draggingTask = "";
    return () => {
      delete root.dataset.draggingTask;
    };
  }, [active]);

  function endDrag() {
    // Suppress the click that the ending drag would otherwise deliver.
    dragEndedAt.current = Date.now();
    setActive(null);
    setOverId(null);
  }

  function onDragStart(event: DragStartEvent) {
    setActive((event.active.data.current as ActiveDrag | undefined) ?? null);
  }

  function onDragOver(event: DragOverEvent) {
    const over = event.over?.id;
    setOverId(typeof over === "string" ? over : null);
  }

  function onDragEnd(event: DragEndEvent) {
    const dragged = active;
    endDrag();
    if (!dragged) return;
    const over = event.over?.id;
    const dropId = typeof over === "string" ? over : null;
    if (dragged.kind === "task") {
      taskDropHandler.current?.(dropId, dragged.task, dragged.groupKey);
    } else {
      projectDropHandler.current?.(dropId, dragged.projectId);
    }
  }

  const value = useMemo<TaskDndValue>(
    () => ({
      activeTask: active?.kind === "task" ? active.task : null,
      activeGroupKey: active?.kind === "task" ? active.groupKey : null,
      activeProjectId: active?.kind === "project" ? active.projectId : null,
      overId,
      didJustDrag: () => Date.now() - dragEndedAt.current < 100,
      registerDropHandler,
      registerProjectDropHandler,
    }),
    [active, overId, registerDropHandler, registerProjectDropHandler],
  );

  return (
    <TaskDndContext.Provider value={value}>
      <DndContext
        // Fixed id: dnd-kit otherwise derives its aria ids from a render
        // counter, which differs between the server and client renders.
        id="task-dnd"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        {children}
      </DndContext>
    </TaskDndContext.Provider>
  );
}
