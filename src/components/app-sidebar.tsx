import { Inbox } from "lucide-react";
import Link from "next/link";

import { NavUser } from "@/components/nav-user";
import { ProjectDialog } from "@/components/project-dialog";
import { Skeleton } from "@/components/ui/skeleton";

export function SidebarListSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-8 items-center gap-2 px-2">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-3.5 w-28 rounded" />
        </div>
      ))}
    </div>
  );
}

export function AppSidebar({
  user,
  projects,
  views,
}: {
  user: { name: string; email: string; image: string | null };
  projects: React.ReactNode;
  views: React.ReactNode;
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30">
      <div className="flex h-14 items-center gap-2 px-4">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          t.
        </span>
        <span className="font-semibold tracking-tight">toodoo</span>
      </div>

      <nav className="flex flex-col gap-1 px-2 py-2">
        <Link
          href="/"
          className="flex h-8 items-center gap-2 rounded-lg px-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Inbox className="size-4 text-muted-foreground" />
          All tasks
        </Link>
      </nav>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
        <div>
          <div className="flex items-center justify-between px-4 pb-1">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Projects
            </span>
            <ProjectDialog />
          </div>
          {projects}
        </div>
        <div>
          <div className="flex items-center justify-between px-4 pb-1">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Views
            </span>
          </div>
          {views}
        </div>
      </div>

      <div className="border-t p-2">
        <NavUser user={user} />
      </div>
    </aside>
  );
}
