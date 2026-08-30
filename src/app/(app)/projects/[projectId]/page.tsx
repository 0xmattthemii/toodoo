import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  BoardSkeleton,
  ProjectHeaderSkeleton,
} from "@/components/board-skeleton";
import { MembersDialog } from "@/components/members-dialog";
import { ProjectActions } from "@/components/project-actions";
import { TaskBoard } from "@/components/task-board";
import {
  getMembership,
  getPendingInvitations,
  getProject,
  getProjectMembers,
  getProjectTasks,
} from "@/lib/data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  return (
    <div className="flex h-full flex-col">
      <Suspense
        fallback={
          <>
            <ProjectHeaderSkeleton />
            <BoardSkeleton />
          </>
        }
      >
        <ProjectContent projectId={projectId} />
      </Suspense>
    </div>
  );
}

async function ProjectContent({ projectId }: { projectId: string }) {
  const session = await requireSession();
  const membership = await getMembership(projectId, session.user.id);
  if (!membership) notFound();

  const [project, tasks, members, invitations] = await Promise.all([
    getProject(projectId),
    getProjectTasks(projectId),
    getProjectMembers(projectId),
    getPendingInvitations(projectId),
  ]);
  if (!project) notFound();

  const isAdmin = membership.role === "admin";

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 px-6">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {project.name}
          </h1>
        </div>
        {project.description ? (
          <p className="hidden truncate text-sm text-muted-foreground md:block">
            {project.description}
          </p>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <MembersDialog
            projectId={project.id}
            members={members}
            invitations={invitations}
            currentUserId={session.user.id}
            isAdmin={isAdmin}
          />
          {isAdmin ? (
            <ProjectActions
              project={{
                id: project.id,
                name: project.name,
                description: project.description,
              }}
            />
          ) : null}
        </div>
      </header>
      <TaskBoard
        tasks={tasks}
        projects={[
          {
            id: project.id,
            name: project.name,
            description: project.description,
            role: membership.role,
          },
        ]}
        people={members}
        currentUserId={session.user.id}
        scopedProjectId={project.id}
      />
    </>
  );
}
