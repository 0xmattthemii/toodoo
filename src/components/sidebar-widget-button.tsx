"use client";

import { ArrowUpRight, PictureInPicture2 } from "lucide-react";

import { openTasksWidget, useDesktopShell } from "@/lib/desktop-shell";

/**
 * Opens the tasks widget — a small window with a simplified list that stays
 * on screen beside other work (components/widget/tasks-widget.tsx). A button
 * that looks like the sidebar's links, since it leaves the page as it is.
 */
export function SidebarWidgetButton() {
  const shell = useDesktopShell();
  // A desktop app from before the widget can't open a second window.
  if (shell && !shell.widget) return null;

  return (
    <button
      type="button"
      onClick={() => openTasksWidget(shell)}
      className="group/widget flex h-8 items-center gap-2 rounded-lg px-2 text-left text-sm text-foreground transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <PictureInPicture2 className="size-4 text-muted-foreground" />
      Tasks widget
      <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/widget:opacity-100 group-focus-visible/widget:opacity-100" />
    </button>
  );
}
