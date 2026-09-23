"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** How long a waking database gets before the one automatic retry. */
const AUTO_RETRY_DELAY_MS = 1_000;

/** When a retry still hasn't replaced this screen, stop waiting on it. */
const AUTO_RETRY_GIVE_UP_MS = 10_000;

/**
 * An error within this long of the last automatic retry means that retry
 * didn't help; show the error instead of retrying in a loop.
 */
const AUTO_RETRY_WINDOW_MS = 30_000;

/**
 * Module scope, so it outlives the boundary remounting after a retry but not
 * a page load — a fresh document gets its own automatic retry.
 */
let lastAutoRetryAt = 0;

/**
 * What an error boundary renders in place of the part of the page that
 * failed. `retry` re-renders just that part, so the rest of the page keeps
 * its state.
 *
 * Failures here are nearly always transient, and the first one is retried
 * without asking: a background refresh that hit a database still waking up,
 * or one Vercel's security checkpoint stopped because its hour-long pass ran
 * out. A fetch can't pass the checkpoint, only a page load can, and Next.js
 * falls back to one when the retry's request is turned away — the checkpoint
 * shows for a moment, then the app. If the retry fails too, the error shows,
 * and its button reloads the page, which also drops any client state that
 * may be what broke.
 */
export function ErrorState({
  retry,
  className,
}: {
  retry: () => void;
  className?: string;
}) {
  const [recovering, setRecovering] = useState(true);
  // The workspace boundary passes a fresh closure on every render; only the
  // latest one matters, and it must not restart the countdown.
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  });

  useEffect(() => {
    const timers = [
      setTimeout(() => {
        if (Date.now() - lastAutoRetryAt < AUTO_RETRY_WINDOW_MS) {
          setRecovering(false);
          return;
        }
        lastAutoRetryAt = Date.now();
        retryRef.current();
      }, AUTO_RETRY_DELAY_MS),
      // Still here: the retry's request never came back.
      setTimeout(() => setRecovering(false), AUTO_RETRY_GIVE_UP_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    // In the desktop app the empty area moves the window (inert in a browser).
    <div
      data-tauri-drag-region
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-6 text-center",
        className,
      )}
    >
      {recovering ? (
        <Loader2
          aria-label="Reconnecting"
          className="size-5 animate-spin text-muted-foreground"
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Something went wrong.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RotateCcw />
            Try again
          </Button>
        </>
      )}
    </div>
  );
}
