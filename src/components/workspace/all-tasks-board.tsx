"use client";

import { BoardContent } from "@/components/board/board-content";
import { BoardProvider } from "@/components/board/board-context";
import { BoardToolbar } from "@/components/board/board-toolbar";
import { useWorkspace } from "@/components/workspace/workspace-provider";

export function AllTasksBoard() {
  const { me, tasks, projects, people } = useWorkspace();

  return (
    <div className="flex h-full flex-col">
      <header
        data-tauri-drag-region="deep"
        className="flex h-14 shrink-0 items-center px-6"
      >
        <h1 className="text-lg font-semibold tracking-tight">All tasks</h1>
      </header>
      <BoardProvider currentUserId={me.id} options={{ projects, people }}>
        <BoardToolbar />
        <BoardContent tasks={tasks} projects={projects} people={people} />
      </BoardProvider>
    </div>
  );
}
