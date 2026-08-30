"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Button that shows a centered spinner while loading without changing size:
 * the label stays mounted (invisible) so the layout never shifts.
 */
export function LoadingButton({
  loading,
  disabled,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { loading: boolean }) {
  return (
    <Button
      {...props}
      disabled={loading || disabled}
      className={cn("relative", className)}
    >
      <span className={cn("contents", loading && "invisible")}>
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-4 animate-spin" />
        </span>
      ) : null}
    </Button>
  );
}
