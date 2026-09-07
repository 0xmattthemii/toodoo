"use client";

import { DragOverlay } from "@dnd-kit/core";
import { Hash } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { reorderProjects } from "@/actions/projects";
import { SidebarProjectLink } from "@/components/sidebar-project-link";
import {
  sidebarProjectFromDropId,
  useTaskDnd,
} from "@/components/task-dnd";
import { tryAction } from "@/lib/action";
import { AppearanceIcon } from "@/lib/appearance";
import { moveItem } from "@/lib/ordering";
import type { ProjectSummary } from "@/lib/types";

/** One row's pitch: the link's h-8 plus the list's gap-0.5. */
const ROW_STEP = 34;

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

      const nextIds = moveItem(ids, from, to);
      setOrdered(
        nextIds.flatMap(
          (id) => ordered.find((project) => project.id === id) ?? [],
        ),
      );

      startTransition(async () => {
        const result = await tryAction(reorderProjects(nextIds), {
          error: "Could not reorder your projects",
        });
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

  // Preview the drop: the rows slide into the order the drop would produce,
  // mirroring `onDrop`. The DOM order stays put and only transforms change,
  // so the slide animates and no row remounts mid-drag. Rows all share one
  // height, which is what lets an index difference become a pixel offset.
  const overProjectId = overId ? sidebarProjectFromDropId(overId) : null;
  const ids = ordered.map((project) => project.id);
  const from = activeProjectId ? ids.indexOf(activeProjectId) : -1;
  const to = overProjectId ? ids.indexOf(overProjectId) : -1;
  const preview =
    from !== -1 && to !== -1 && from !== to ? moveItem(ids, from, to) : ids;
  const activeProject = ordered.find(
    (project) => project.id === activeProjectId,
  );

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {ordered.map((project, index) => (
        <SidebarProjectLink
          key={project.id}
          project={project}
          shift={(preview.indexOf(project.id) - index) * ROW_STEP}
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
            className="pointer-events-none flex h-8 items-center gap-2 rounded-lg bg-background px-2 text-sm text-foreground shadow-lg ring-1 ring-border opacity-80"
          >
            <AppearanceIcon
              icon={activeProject.icon}
              color={activeProject.color}
              fallback={Hash}
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="truncate">{activeProject.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </div>
  );
}
