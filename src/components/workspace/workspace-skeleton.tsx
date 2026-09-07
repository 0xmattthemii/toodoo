import { Plus } from "lucide-react";

import { AppSidebar, SidebarListSkeleton } from "@/components/app-sidebar";
import { BoardContentSkeleton, BoardHeaderSkeleton } from "@/components/board-skeleton";
import { Button } from "@/components/ui/button";

/**
 * The app shell as it looks while the workspace loads on a full page load:
 * the sidebar frame with the signed-in user, placeholders for its lists, and
 * a placeholder board. Client navigations never show this.
 */
export function WorkspaceSkeleton({
  user,
  googleEnabled,
}: {
  user: { name: string; email: string; image: string | null };
  googleEnabled: boolean;
}) {
  return (
    <div className="flex h-dvh w-full">
      <AppSidebar
        user={user}
        googleEnabled={googleEnabled}
        projects={<SidebarListSkeleton />}
        views={<SidebarListSkeleton />}
        newProject={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="New project"
            className="text-muted-foreground"
            disabled
          >
            <Plus />
          </Button>
        }
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex h-full flex-col">
          <BoardHeaderSkeleton />
          <BoardContentSkeleton />
        </div>
      </main>
    </div>
  );
}
