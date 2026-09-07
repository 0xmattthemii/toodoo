"use client";

import { Hash } from "lucide-react";
import { useMemo } from "react";

import { BoardContent } from "@/components/board/board-content";
import { BoardProvider } from "@/components/board/board-context";
import { BoardToolbar } from "@/components/board/board-toolbar";
import { MembersDialog } from "@/components/members-dialog";
import { ProjectActions } from "@/components/project-actions";
import { WorkspaceNotFound } from "@/components/workspace/not-found-state";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { AppearanceIcon } from "@/lib/appearance";

export function ProjectBoard({ projectId }: { projectId: string }) {
  const { me, tasks, projects, projectsById, membersOf } = useWorkspace();
  const project = projectsById.get(projectId);
  const members = membersOf(projectId);

  const projectTasks = useMemo(
    () => tasks.filter((task) => task.projectId === projectId),
    [tasks, projectId],
  );
  const scoped = useMemo(() => (project ? [project] : []), [project]);

  if (!project) {
    return (
      <WorkspaceNotFound
        title="Project not found"
        description="It may have been deleted, or you are no longer a member."
      />
    );
  }

  const isAdmin = project.role === "admin";

  return (
    <div className="flex h-full flex-col">
      {/* data-tauri-drag-region: in the desktop app the header row is the
          title bar, so dragging it moves the window (buttons keep working;
          inert in a browser). Same on the other boards and the skeleton. */}
      <header
        data-tauri-drag-region="deep"
        className="flex h-14 shrink-0 items-center gap-2.5 px-6"
      >
        <AppearanceIcon
          icon={project.icon}
          color={project.color}
          fallback={Hash}
          className="size-4.5 shrink-0 text-muted-foreground"
        />
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {project.name}
        </h1>
        {project.description ? (
          <p className="hidden truncate text-sm text-muted-foreground md:block">
            {project.description}
          </p>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <MembersDialog
            projectId={project.id}
            currentUserId={me.id}
            isAdmin={isAdmin}
          />
          {isAdmin ? <ProjectActions project={project} /> : null}
        </div>
      </header>
      <BoardProvider
        currentUserId={me.id}
        scopedProjectId={projectId}
        options={{ projects, people: members }}
      >
        <BoardToolbar />
        <BoardContent
          tasks={projectTasks}
          projects={scoped}
          people={members}
          dialogProjects={projects}
        />
      </BoardProvider>
    </div>
  );
}
