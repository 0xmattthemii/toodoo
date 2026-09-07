"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Last resort for a server error that reaches the app shell — a dropped
 * database connection, most likely. Without it, Next.js replaces the whole
 * document with its built-in "This page couldn't load" screen, sidebar and
 * all; here the shell stays up and "Try again" re-renders just this part.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Something went wrong loading this page.
      </p>
      <Button variant="outline" onClick={() => retry()}>
        <RotateCcw />
        Try again
      </Button>
    </div>
  );
}
