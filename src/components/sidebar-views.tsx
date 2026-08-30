import { Bookmark } from "lucide-react";
import Link from "next/link";

import { AppearanceIcon } from "@/lib/appearance";
import { getUserViews } from "@/lib/data";

export async function SidebarViews({ userId }: { userId: string }) {
  const views = await getUserViews(userId);

  if (views.length === 0) {
    return (
      <p className="px-4 py-1 text-sm text-muted-foreground">
        No saved views
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {views.map((view) => (
        <Link
          key={view.id}
          href={`/views/${view.id}`}
          className="flex h-8 items-center gap-2 rounded-lg px-2 text-sm text-foreground hover:bg-accent"
        >
          <AppearanceIcon
            icon={view.icon}
            color={view.color}
            fallback={Bookmark}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="truncate">{view.name}</span>
        </Link>
      ))}
    </div>
  );
}
