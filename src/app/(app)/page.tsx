import { Suspense } from "react";

import { BoardContent } from "@/components/board/board-content";
import { BoardProvider } from "@/components/board/board-context";
import { BoardToolbar } from "@/components/board/board-toolbar";
import { BoardContentSkeleton } from "@/components/board-skeleton";
import { getKnownPeople, getUserProjects, getVisibleTasks } from "@/lib/data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AllTasksPage() {
  const session = await requireSession();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center px-6">
        <h1 className="text-lg font-semibold tracking-tight">All tasks</h1>
      </header>
      <BoardProvider currentUserId={session.user.id}>
        <BoardToolbar />
        <Suspense fallback={<BoardContentSkeleton />}>
          <AllTasksContent userId={session.user.id} />
        </Suspense>
      </BoardProvider>
    </div>
  );
}

async function AllTasksContent({ userId }: { userId: string }) {
  const [tasks, projects, people] = await Promise.all([
    getVisibleTasks(userId),
    getUserProjects(userId),
    getKnownPeople(userId),
  ]);
  return <BoardContent tasks={tasks} projects={projects} people={people} />;
}
