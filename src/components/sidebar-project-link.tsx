"use client";

import { useDroppable } from "@dnd-kit/core";
import { Hash } from "lucide-react";
import Link from "next/link";

import {
  sidebarProjectDropId,
  useTaskDnd,
} from "@/components/task-dnd";
import { AppearanceIcon } from "@/lib/appearance";
import type { ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Sidebar link that also accepts a task dragged from the board. */
export function SidebarProjectLink({ project }: { project: ProjectSummary }) {
  const { activeTask } = useTaskDnd();
  const { setNodeRef, isOver } = useDroppable({
    id: sidebarProjectDropId(project.id),
    disabled: !activeTask,
  });
  // A task's own project stays droppable — the drop is a no-op — so that the
  // pointer resolves to it rather than falling through to a neighbouring row.
  // It simply doesn't advertise itself as a target.
  const isTarget = activeTask !== null && activeTask.projectId !== project.id;

  return (
    <Link
      ref={setNodeRef}
      href={`/projects/${project.id}`}
      className={cn(
        "flex h-8 items-center gap-2 rounded-lg px-2 text-sm text-foreground transition-all duration-150 hover:bg-accent",
        isTarget && "ring-1 ring-border",
        isTarget && isOver && "bg-accent ring-2 ring-ring/40",
      )}
    >
      <AppearanceIcon
        icon={project.icon}
        color={project.color}
        fallback={Hash}
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="truncate">{project.name}</span>
    </Link>
  );
}
