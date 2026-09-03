"use client";

import { AppWindow, Download, RotateCcw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DesktopDownloads } from "@/lib/desktop";
import { desktopConnectUrl } from "@/lib/desktop-shell";

type Platform = "macos" | "windows";

const PLATFORM_LABELS: Record<Platform, string> = {
  macos: "macOS",
  windows: "Windows",
};

type DownloadsState =
  | { status: "loading" }
  | { status: "ready"; downloads: DesktopDownloads }
  | { status: "error" };

const subscribe = () => () => {};

/**
 * Install instructions for the desktop app, one tab per platform. Opened from
 * the profile menu; inside the desktop app that menu offers "Switch server…"
 * instead, so this never renders there.
 */
export function DesktopDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Browser-only value, read after hydration so server and client markup match.
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
  const [state, setState] = useState<DownloadsState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const loaded = state.status === "ready";

  // Fetched when the dialog first opens: the links come from the GitHub API,
  // which shouldn't be called on every app load just to render a menu item.
  // A failure leaves `loaded` false without re-running, so Retry drives it.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    fetch("/api/desktop/downloads")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<DesktopDownloads>;
      })
      .then((downloads) => {
        if (!cancelled) setState({ status: "ready", downloads });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded, reloadKey]);

  function onRetry() {
    setState({ status: "loading" });
    setReloadKey((key) => key + 1);
  }

  const address = (
    <code className="font-mono text-xs break-all">
      {origin || "this address"}
    </code>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Toodoo for desktop</DialogTitle>
          <DialogDescription>
            A native app for macOS and Windows that connects to this server.
          </DialogDescription>
        </DialogHeader>

        {/* macOS first: the default tab, whatever the visitor is running. */}
        <Tabs defaultValue="macos" className="gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="macos">macOS</TabsTrigger>
            <TabsTrigger value="windows">Windows</TabsTrigger>
          </TabsList>

          <TabsContent value="macos" className="grid gap-4">
            <DownloadLinks platform="macos" state={state} onRetry={onRetry} />
            {/* min-w-0 throughout: grid/flex items default to min-width:auto,
                and the long xattr command would otherwise widen the dialog. */}
            <Steps>
              <Step>
                Open the <code className="font-mono text-xs">.dmg</code> and
                drag <strong>Toodoo</strong> to Applications.
              </Step>
              <Step>
                Builds aren&apos;t code-signed yet, so Gatekeeper reports the
                app as damaged. Run this once in Terminal:
                <pre className="mt-1 max-w-full rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap select-all">
                  xattr -d com.apple.quarantine /Applications/Toodoo.app
                </pre>
              </Step>
              <Step>
                Open Toodoo and connect it to this server — click below, or
                type {address} on the app&apos;s connect screen.
              </Step>
            </Steps>
          </TabsContent>

          <TabsContent value="windows" className="grid gap-4">
            <DownloadLinks platform="windows" state={state} onRetry={onRetry} />
            <Steps>
              <Step>
                Run the installer. Toodoo installs for the current user, so no
                admin rights are needed.
              </Step>
              <Step>
                Builds aren&apos;t code-signed yet, so SmartScreen warns once:
                choose <em>More info → Run anyway</em>.
              </Step>
              <Step>
                Open Toodoo and connect it to this server — click below, or
                type {address} on the app&apos;s connect screen.
              </Step>
            </Steps>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            variant="outline"
            className="w-full"
            disabled={!origin}
            onClick={() => {
              window.location.href = desktopConnectUrl(origin);
            }}
          >
            <AppWindow /> Open in Toodoo desktop
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Nothing happens? Install the app first, then try again.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The installer button and the release line under it. Both keep the same box
 * in every state — an h-8 button and a one-line (h-4) caption — so switching
 * from the skeleton to the real links doesn't move the steps below.
 */
function DownloadLinks({
  platform,
  state,
  onRetry,
}: {
  platform: Platform;
  state: DownloadsState;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <div className="grid gap-2" aria-hidden>
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="mx-auto h-4 w-44" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="grid gap-2">
        <Button variant="outline" className="w-full" onClick={onRetry}>
          <RotateCcw /> Try again
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Couldn&apos;t load the download links.
        </p>
      </div>
    );
  }

  const { downloads } = state;
  const installer = platform === "macos" ? downloads.macos : downloads.windows;

  return (
    <div className="grid gap-2">
      {installer ? (
        <a
          href={installer}
          className={buttonVariants({ className: "w-full" })}
        >
          <Download /> Download for {PLATFORM_LABELS[platform]}
        </a>
      ) : (
        <a
          href={downloads.releasesUrl}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ className: "w-full" })}
        >
          <Download /> Get the latest release
        </a>
      )}
      <p className="text-center text-xs text-muted-foreground">
        {downloads.version ? `Version ${downloads.version} · ` : null}
        <a
          href={downloads.releasesUrl}
          target="_blank"
          rel="noreferrer"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          All releases
        </a>
      </p>
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="grid min-w-0 gap-3 text-sm [counter-reset:step]">
      {children}
    </ol>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 gap-3 [counter-increment:step]">
      <span
        aria-hidden
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground before:content-[counter(step)]"
      />
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
