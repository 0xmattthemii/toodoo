"use client";

import { Bookmark } from "lucide-react";

import { SidebarLink } from "@/components/sidebar-link";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { AppearanceIcon } from "@/lib/appearance";

export function SidebarViews() {
  const { views } = useWorkspace();

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
        <SidebarLink key={view.id} href={`/views/${view.id}`}>
          <AppearanceIcon
            icon={view.icon}
            color={view.color}
            fallback={Bookmark}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="truncate">{view.name}</span>
        </SidebarLink>
      ))}
    </div>
  );
}
