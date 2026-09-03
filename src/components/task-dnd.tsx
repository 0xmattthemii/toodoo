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
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import type { TaskWithMeta } from "@/lib/types";

const SIDEBAR_PROJECT_PREFIX = "sidebar-project:";

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

/** Called on every drop, with a null id when the task was dropped nowhere. */
type DropHandler = (dropId: string | null, task: TaskWithMeta) => void;

type TaskDndValue = {
  /** The task being dragged, for drop targets and the drag overlay. */
  activeTask: TaskWithMeta | null;
  registerDropHandler: (handler: DropHandler | null) => void;
};

const TaskDndContext = createContext<TaskDndValue | null>(null);

export function useTaskDnd() {
  const value = useContext(TaskDndContext);
  if (!value) {
    throw new Error("useTaskDnd must be used inside <TaskDndProvider>");
  }
  return value;
}

// Prefer the target under the pointer; fall back to overlap for edge drops.
const collisionDetection: CollisionDetection = (args) => {
  const withPointer = pointerWithin(args);
  return withPointer.length > 0 ? withPointer : rectIntersection(args);
};

/**
 * One drag context around the whole app shell, so a task can be dropped on a
 * kanban column in the main area or on a project in the sidebar. It only
 * tracks what is being dragged — the board registers what a drop means, since
 * it owns the optimistic state and the server action.
 */
export function TaskDndProvider({ children }: { children: React.ReactNode }) {
  const [activeTask, setActiveTask] = useState<TaskWithMeta | null>(null);
  const dropHandler = useRef<DropHandler | null>(null);

  const sensors = useSensors(
    // A small distance threshold keeps plain clicks opening the edit dialog.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const registerDropHandler = useCallback((handler: DropHandler | null) => {
    dropHandler.current = handler;
  }, []);

  function onDragStart(event: DragStartEvent) {
    setActiveTask((event.active.data.current?.task as TaskWithMeta) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    const task = activeTask;
    setActiveTask(null);
    if (!task) return;
    const over = event.over?.id;
    dropHandler.current?.(typeof over === "string" ? over : null, task);
  }

  const value = useMemo<TaskDndValue>(
    () => ({ activeTask, registerDropHandler }),
    [activeTask, registerDropHandler],
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
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveTask(null)}
      >
        {children}
      </DndContext>
    </TaskDndContext.Provider>
  );
}
