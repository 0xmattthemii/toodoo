"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  desktopWidgetUrl,
  sendToDesktop,
  useDesktopShell,
} from "@/lib/desktop-shell";

const COPY = {
  "signed-out": {
    title: "Sign in to see your tasks",
    body: "Sign in to toodoo, then come back to this window.",
  },
  "no-access": {
    title: "No workspace yet",
    body: "Open toodoo to see where this account stands.",
  },
} as const;

/**
 * Shown in the widget's window in place of the list when there is nothing it
 * may list. The window is too small to sign in in, so it points at the app
 * and looks again whenever the user comes back to it.
 */
export function WidgetNotice({ reason }: { reason: keyof typeof COPY }) {
  const router = useRouter();
  const floats = useDesktopShell()?.widget === true;
  const { title, body } = COPY[reason];

  useEffect(() => {
    const retry = () => router.refresh();
    window.addEventListener("focus", retry);
    return () => window.removeEventListener("focus", retry);
  }, [router]);

  return (
    <div
      data-tauri-drag-region
      className="flex h-dvh cursor-default flex-col items-center justify-center gap-3 bg-background px-6 text-center select-none"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
      <Button
        size="sm"
        onClick={() => {
          if (floats) sendToDesktop(desktopWidgetUrl("app"));
          else window.open("/", "toodoo-app")?.focus();
        }}
      >
        Open toodoo
      </Button>
    </div>
  );
}
