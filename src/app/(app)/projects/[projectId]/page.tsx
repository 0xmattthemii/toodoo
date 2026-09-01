import { Hash } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BoardContent } from "@/components/board/board-content";
import { BoardProvider } from "@/components/board/board-context";
import { BoardToolbar } from "@/components/board/board-toolbar";
import {
  BoardContentSkeleton,
  ProjectHeaderSkeleton,
} from "@/components/board-skeleton";
import { MembersDialog } from "@/components/members-dialog";
import { ProjectActions } from "@/components/project-actions";
import { AppearanceIcon } from "@/lib/appearance";
import {
  getMembership,
  getPendingInvitations,
  getProject,
  getProjectMembers,
  getProjectTasks,
  getUserProjects,
} from "@/lib/data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[projectId]">) {
  const session = await requireSession();
  const { projectId } = await params;

  return (
    <div className="flex h-full flex-col">
      <Suspense fallback={<ProjectHeaderSkeleton />}>
        <ProjectHeader projectId={projectId} userId={session.user.id} />
      </Suspense>
      <BoardProvider
        currentUserId={session.user.id}
        scopedProjectId={projectId}
      >
        <BoardToolbar />
        <Suspense fallback={<BoardContentSkeleton />}>
          <ProjectTasksContent
            projectId={projectId}
            userId={session.user.id}
          />
        </Suspense>
      </BoardProvider>
    </div>
  );
}

async function ProjectHeader({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  const membership = await getMembership(projectId, userId);
  if (!membership) notFound();

  const [project, members, invitations] = await Promise.all([
    getProject(projectId),
    getProjectMembers(projectId),
    getPendingInvitations(projectId),
  ]);
  if (!project) notFound();

  const isAdmin = membership.role === "admin";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 px-6">
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
          members={members}
          invitations={invitations}
          currentUserId={userId}
          isAdmin={isAdmin}
        />
        {isAdmin ? (
          <ProjectActions
            project={{
              id: project.id,
              name: project.name,
              description: project.description,
              icon: project.icon,
              color: project.color,
            }}
          />
        ) : null}
      </div>
    </header>
  );
}

async function ProjectTasksContent({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  const membership = await getMembership(projectId, userId);
  if (!membership) notFound();

  const [project, tasks, members, allProjects] = await Promise.all([
    getProject(projectId),
    getProjectTasks(projectId),
    getProjectMembers(projectId),
    getUserProjects(userId),
  ]);
  if (!project) notFound();

  return (
    <BoardContent
      tasks={tasks}
      projects={[
        {
          id: project.id,
          name: project.name,
          description: project.description,
          icon: project.icon,
          color: project.color,
          role: membership.role,
        },
      ]}
      people={members}
      dialogProjects={allProjects}
    />
  );
}
