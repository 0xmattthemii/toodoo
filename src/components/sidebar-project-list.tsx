"use client";

import { DragOverlay, useDndMonitor } from "@dnd-kit/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { reorderProjects } from "@/actions/projects";
import {
  SidebarProjectLink,
  SidebarProjectRow,
} from "@/components/sidebar-project-link";
import {
  sidebarProjectFromDropId,
  useTaskDnd,
} from "@/components/task-dnd";
import { tryAction } from "@/lib/action";
import { moveItem, previewShifts, rowPitch } from "@/lib/ordering";
import type { ProjectSummary } from "@/lib/types";

/**
 * The sidebar's project list, reorderable by dragging one row onto another.
 * The order is stored per member, so rearranging it never moves anything for
 * the people a project is shared with.
 */
export function SidebarProjectList({
  projects,
}: {
  projects: ProjectSummary[];
}) {
  const { activeProjectId, overId, registerProjectDropHandler } = useTaskDnd();
  const [ordered, setOrdered] = useState(projects);
  const [, startTransition] = useTransition();
  const container = useRef<HTMLDivElement>(null);
  const [pitch, setPitch] = useState(0);

  // Measured as a project drag starts, so a restyled row can't go stale.
  useDndMonitor({
    onDragStart(event) {
      const data = event.active.data.current as { kind?: string } | undefined;
      if (data?.kind === "project") setPitch(rowPitch(container.current));
    },
  });

  // The local order only bridges the gap between the drop and the revalidation.
  const [prevProjects, setPrevProjects] = useState(projects);
  if (prevProjects !== projects) {
    setPrevProjects(projects);
    setOrdered(projects);
  }

  const onDrop = useCallback(
    (dropId: string | null, projectId: string) => {
      if (!dropId) return;
      const targetId = sidebarProjectFromDropId(dropId);
      if (targetId === null) return;

      const ids = ordered.map((project) => project.id);
      const from = ids.indexOf(projectId);
      const to = ids.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return;

      const next = moveItem(ordered, from, to);
      setOrdered(next);

      startTransition(async () => {
        const result = await tryAction(
          reorderProjects(next.map((project) => project.id)),
          {
            error: "Could not reorder your projects",
          },
        );
        if (result.error) {
          toast.error(result.error);
          setOrdered(projects);
        }
      });
    },
    [ordered, projects, startTransition],
  );

  useEffect(() => {
    registerProjectDropHandler(onDrop);
    return () => registerProjectDropHandler(null);
  }, [registerProjectDropHandler, onDrop]);

  // Preview the drop: the rows slide into the order `onDrop` would produce.
  const shiftFor = previewShifts(
    ordered.map((project) => project.id),
    activeProjectId,
    overId ? sidebarProjectFromDropId(overId) : null,
    pitch,
  );
  const activeProject = ordered.find(
    (project) => project.id === activeProjectId,
  );

  return (
    <div ref={container} className="flex flex-col gap-0.5 px-2">
      {ordered.map((project, index) => (
        <SidebarProjectLink
          key={project.id}
          project={project}
          shift={shiftFor(project.id, index)}
        />
      ))}
      {/* The board mounts its own overlay for tasks; both stay mounted so the
          drop animation can play, and only the one whose kind is dragging
          renders anything. The row is translucent so the list stays readable
          underneath, and inert so the copy stays out of the a11y tree.
          Side effects are off: dnd-kit's default hides the source node during
          the drop and restores it afterwards, and with two overlays the second
          would capture the first one's "hidden" as the value to restore. The
          board's overlay keeps the default and covers both kinds. */}
      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.2, 0.8, 0.35, 1)",
          sideEffects: null,
        }}
      >
        {activeProject ? (
          <div
            inert
            className="pointer-events-none flex h-8 items-center gap-2 rounded-lg bg-background pr-6 pl-2 text-sm text-foreground shadow-lg ring-1 ring-border opacity-80"
          >
            <SidebarProjectRow project={activeProject} />
          </div>
        ) : null}
      </DragOverlay>
    </div>
  );
}
