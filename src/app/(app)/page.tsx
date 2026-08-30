import { Suspense } from "react";

import { BoardSkeleton } from "@/components/board-skeleton";
import { TaskBoard } from "@/components/task-board";
import { getKnownPeople, getUserProjects, getVisibleTasks } from "@/lib/data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default function AllTasksPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center px-6">
        <h1 className="text-lg font-semibold tracking-tight">All tasks</h1>
      </header>
      <Suspense fallback={<BoardSkeleton />}>
        <AllTasksBoard />
      </Suspense>
    </div>
  );
}

async function AllTasksBoard() {
  const session = await requireSession();
  const [tasks, projects, people] = await Promise.all([
    getVisibleTasks(session.user.id),
    getUserProjects(session.user.id),
    getKnownPeople(session.user.id),
  ]);

  return (
    <TaskBoard
      tasks={tasks}
      projects={projects}
      people={people}
      currentUserId={session.user.id}
    />
  );
}
