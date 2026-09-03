"use client";

import { AppWindow, Check, Download } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DesktopDownloads } from "@/lib/desktop";
import { desktopConnectUrl, useDesktopShell } from "@/lib/desktop-shell";
import { cn } from "@/lib/utils";

type Platform = "macos" | "windows" | "other";

const subscribe = () => () => {};

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return "macos";
  if (/Win/i.test(ua)) return "windows";
  return "other";
}

/** Public install page: download links, first-run steps, and a deep link that prefills this server in the app. */
export function DesktopDownloadCard({
  downloads,
}: {
  downloads: DesktopDownloads;
}) {
  const shell = useDesktopShell();
  // Browser-only values, read after hydration so server and client markup match.
  const platform = useSyncExternalStore(subscribe, detectPlatform, () => "other" as Platform);
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");

  if (shell) {
    return (
      <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">You&apos;re in the desktop app</CardTitle>
          <CardDescription>
            Toodoo desktop {shell.version}, connected to{" "}
            <code className="font-mono text-xs">{origin}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Link href="/" className={buttonVariants({ className: "w-full" })}>
            <Check /> Back to your tasks
          </Link>
          <p className="text-center text-xs text-muted-foreground">
            To use another server, open <em>Switch server</em> from the profile menu.
          </p>
        </CardContent>
      </Card>
    );
  }

  const installers: { key: Exclude<Platform, "other">; label: string; url: string | null }[] = [
    { key: "macos", label: "Download for macOS", url: downloads.macos },
    { key: "windows", label: "Download for Windows", url: downloads.windows },
  ];
  // The detected platform first, as the primary button.
  installers.sort((a, b) => Number(b.key === platform) - Number(a.key === platform));
  const hasDirectLinks = installers.some((i) => i.url);

  return (
    <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/[0.04]">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Toodoo for desktop</CardTitle>
        <CardDescription>
          A native app for macOS and Windows that connects to this server
          {downloads.version ? ` — version ${downloads.version}` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          {hasDirectLinks ? (
            installers.map((installer, index) =>
              installer.url ? (
                <a
                  key={installer.key}
                  href={installer.url}
                  className={buttonVariants({
                    variant: index === 0 ? "default" : "outline",
                    className: "w-full",
                  })}
                >
                  <Download /> {installer.label}
                </a>
              ) : null,
            )
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
          <a
            href={downloads.releasesUrl}
            target="_blank"
            rel="noreferrer"
            className="text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            All releases
          </a>
        </div>

        {/* min-w-0 throughout: grid/flex items default to min-width:auto, and the
            long xattr command would otherwise widen the card. */}
        <ol className="grid min-w-0 gap-3 text-sm [counter-reset:step]">
          <Step>
            Install the app. Builds aren&apos;t code-signed yet, so the OS will
            warn once:
            <ul className="mt-1.5 grid min-w-0 gap-1.5 text-xs text-muted-foreground">
              <li className={cn("min-w-0", platform === "macos" && "text-foreground")}>
                <strong>macOS</strong> — drag Toodoo to Applications, then run
                once in Terminal:
                <pre className="mt-1 max-w-full rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all select-all">
                  xattr -d com.apple.quarantine /Applications/Toodoo.app
                </pre>
              </li>
              <li className={cn("min-w-0", platform === "windows" && "text-foreground")}>
                <strong>Windows</strong> — on the SmartScreen prompt choose{" "}
                <em>More info → Run anyway</em>.
              </li>
            </ul>
          </Step>
          <Step>
            Open Toodoo and connect it to this server — click below, or type{" "}
            <code className="font-mono text-xs break-all">{origin || "this address"}</code>{" "}
            on the app&apos;s connect screen.
          </Step>
        </ol>
      </CardContent>
      <CardFooter className="flex-col gap-2">
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
      </CardFooter>
    </Card>
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
