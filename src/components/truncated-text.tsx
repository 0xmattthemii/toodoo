"use client";

import { useRef, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Quick enough to feel like reading on, slow enough not to flicker past. */
const OPEN_DELAY = 150;

/**
 * One line of text that ends in an ellipsis when it doesn't fit, and then —
 * only then — shows the whole of it in a tooltip on hover. Nothing opens
 * while a task is being dragged across the board (see TaskDndProvider).
 */
export function TruncatedText({
  text,
  className,
  disabled,
}: {
  text: string;
  className?: string;
  /** E.g. on a drag overlay, which is a picture, not something to hover. */
  disabled?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  if (disabled) {
    return <span className={cn("truncate", className)}>{text}</span>;
  }

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        const element = ref.current;
        const cut = element !== null && element.scrollWidth > element.clientWidth;
        const dragging = "draggingTask" in document.documentElement.dataset;
        setOpen(next && cut && !dragging);
      }}
    >
      <TooltipTrigger
        delay={OPEN_DELAY}
        closeDelay={0}
        render={<span ref={ref} />}
        className={cn("truncate", className)}
      >
        {text}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm break-words">{text}</TooltipContent>
    </Tooltip>
  );
}
