import { Bookmark } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BoardContent } from "@/components/board/board-content";
import { BoardProvider } from "@/components/board/board-context";
import { BoardToolbar } from "@/components/board/board-toolbar";
import { ViewActions } from "@/components/board/view-actions";
import { BoardContentSkeleton } from "@/components/board-skeleton";
import { AppearanceIcon } from "@/lib/appearance";
import { getKnownPeople, getUserProjects, getView, getVisibleTasks } from "@/lib/data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ViewPage({
  params,
}: PageProps<"/views/[viewId]">) {
  const session = await requireSession();
  const { viewId } = await params;
  const view = await getView(viewId, session.user.id);
  if (!view) notFound();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2.5 px-6">
        <AppearanceIcon
          icon={view.icon}
          color={view.color}
          fallback={Bookmark}
          className="size-4.5 shrink-0 text-muted-foreground"
        />
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {view.name}
        </h1>
        <div className="ml-auto">
          <ViewActions view={view} />
        </div>
      </header>
      <BoardProvider
        currentUserId={session.user.id}
        viewId={view.id}
        initialConfig={view.config}
      >
        <BoardToolbar />
        <Suspense fallback={<BoardContentSkeleton />}>
          <ViewContent userId={session.user.id} />
        </Suspense>
      </BoardProvider>
    </div>
  );
}

async function ViewContent({ userId }: { userId: string }) {
  const [tasks, projects, people] = await Promise.all([
    getVisibleTasks(userId),
    getUserProjects(userId),
    getKnownPeople(userId),
  ]);
  return <BoardContent tasks={tasks} projects={projects} people={people} />;
}
