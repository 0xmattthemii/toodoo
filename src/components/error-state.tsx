"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What an error boundary renders in place of the part of the page that
 * failed — most likely a database connection that didn't come up. `retry`
 * re-renders just that part, so the rest of the page keeps its state.
 */
export function ErrorState({
  retry,
  className,
}: {
  retry: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-6 text-center",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">Something went wrong.</p>
      <Button variant="outline" onClick={retry}>
        <RotateCcw />
        Try again
      </Button>
    </div>
  );
}
