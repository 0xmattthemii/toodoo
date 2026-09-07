"use client";

import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

/** What `useDraggable` hands the element that starts the drag. */
export type DragHandleProps = {
  ref: (element: HTMLElement | null) => void;
  listeners: DraggableSyntheticListeners;
  attributes: DraggableAttributes;
};

/**
 * The grip that starts a drag. It is the only part of a row that does, so the
 * rest of the row stays free for clicking. It fades in when the row is hovered
 * (the row must be a `group/row`) and stays visible while it has focus.
 */
export function DragHandle({
  handle,
  label,
  className,
}: {
  /** Omit for a static grip, e.g. on the drag overlay. */
  handle?: DragHandleProps;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      ref={handle?.ref}
      {...handle?.listeners}
      {...handle?.attributes}
      aria-label={label}
      // A click without a drag must not fall through to what the row does.
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity outline-none group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing",
        className,
      )}
    >
      <GripVertical className="size-3.5" />
    </button>
  );
}
