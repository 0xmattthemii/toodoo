"use client";

import { Bookmark } from "lucide-react";

import { BoardContent } from "@/components/board/board-content";
import { BoardProvider } from "@/components/board/board-context";
import { BoardToolbar } from "@/components/board/board-toolbar";
import { ViewActions } from "@/components/board/view-actions";
import { WorkspaceNotFound } from "@/components/workspace/not-found-state";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { AppearanceIcon } from "@/lib/appearance";

export function ViewBoard({ viewId }: { viewId: string }) {
  const { me, tasks, projects, people, viewsById } = useWorkspace();
  const view = viewsById.get(viewId);

  if (!view) {
    return (
      <WorkspaceNotFound
        title="View not found"
        description="It may have been deleted."
      />
    );
  }

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
        currentUserId={me.id}
        viewId={view.id}
        initialConfig={view.config}
        options={{ projects, people }}
      >
        <BoardToolbar />
        <BoardContent tasks={tasks} projects={projects} people={people} />
      </BoardProvider>
    </div>
  );
}
