"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Hash } from "lucide-react";
import Link from "next/link";

import { DragHandle } from "@/components/drag-handle";
import {
  projectDragId,
  sidebarProjectDropId,
  useTaskDnd,
} from "@/components/task-dnd";
import { AppearanceIcon } from "@/lib/appearance";
import type { ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/** What a project row shows: its icon and name. Shared with the drag overlay
 * so the copy that follows the pointer is the row it lifted off. */
export function SidebarProjectRow({ project }: { project: ProjectSummary }) {
  return (
    <>
      <AppearanceIcon
        icon={project.icon}
        color={project.color}
        fallback={Hash}
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="truncate">{project.name}</span>
    </>
  );
}

/**
 * Sidebar link that can be dragged to a new place in the list by its grip, and
 * that also accepts a task dragged from the board. The grip sits beside the
 * link rather than inside it, so grabbing it never navigates.
 */
export function SidebarProjectLink({
  project,
  shift = 0,
}: {
  project: ProjectSummary;
  /** Pixels to slide by while a reorder is previewed. */
  shift?: number;
}) {
  const { activeTask, activeProjectId } = useTaskDnd();
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: sidebarProjectDropId(project.id),
    disabled: !activeTask && !activeProjectId,
  });
  const {
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({
    id: projectDragId(project.id),
    data: { kind: "project", projectId: project.id },
  });

  // A task's own project stays droppable — the drop is a no-op — so that the
  // pointer resolves to it rather than falling through to a neighbouring row.
  // It simply doesn't advertise itself as a target.
  const isTaskTarget = activeTask !== null && activeTask.projectId !== project.id;

  return (
    <div ref={setDropRef}>
      {/* The row being dragged stays as a faint placeholder — the overlay is
          what follows the pointer. The slide only animates while a project is
          in the air: on the drop, the DOM reorders and the offsets vanish in
          the same render, and animating that would slide every row back to
          where it already is. */}
      <div
        ref={setDragRef}
        style={{ transform: shift ? `translateY(${shift}px)` : undefined }}
        className={cn(
          "group/row relative rounded-lg",
          activeProjectId !== null && "transition-[transform,opacity] duration-150",
          isDragging && "opacity-30",
        )}
      >
        <Link
          href={`/projects/${project.id}`}
          className={cn(
            "flex h-8 items-center gap-2 rounded-lg pr-6 pl-2 text-sm text-foreground transition-all duration-150 hover:bg-accent",
            isTaskTarget && "ring-1 ring-border",
            isTaskTarget && isOver && "bg-accent ring-2 ring-ring/40",
          )}
        >
          <SidebarProjectRow project={project} />
        </Link>
        <DragHandle
          handle={{ ref: setActivatorNodeRef, listeners, attributes }}
          label={`Drag "${project.name}"`}
          className="absolute top-1 right-1"
        />
      </div>
    </div>
  );
}
