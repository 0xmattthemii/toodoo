"use client";

import { format } from "date-fns";
import { CalendarClock } from "lucide-react";

import { dueBucket } from "@/components/board/grouping";
import { ProjectBadge } from "@/components/board/project-badge";
import { DragHandle, type DragHandleProps } from "@/components/drag-handle";
import { TruncatedText } from "@/components/truncated-text";
import { UserAvatar } from "@/components/user-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { deadlineDate } from "@/lib/deadline";
import { cn } from "@/lib/utils";
import type { Person, TaskWithMeta } from "@/lib/types";

// A task as the boards draw it: a list row or a kanban/calendar card, with
// the pieces they share.

/**
 * The checkbox and the space around it. Clicking anywhere in that zone toggles
 * the task, so the target is bigger than the 16px box; the checkbox itself
 * still handles its own click (and keyboard), so only clicks on the padding
 * are turned into toggles here.
 */
function DoneCheckbox({
  task,
  onToggleDone,
  overdue,
  className,
}: {
  task: TaskWithMeta;
  onToggleDone: (done: boolean) => void;
  /** Rings the circle in red, where no date is shown to say it is late. */
  overdue?: boolean;
  className?: string;
}) {
  return (
    <span
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onToggleDone(!task.done);
      }}
      className={cn("flex cursor-pointer items-center", className)}
    >
      <Checkbox
        checked={task.done}
        onCheckedChange={(checked) => onToggleDone(checked === true)}
        className={cn(
          // The stock checkbox pads its hit area with an invisible `::after`
          // that reaches 12px past the box on each side, which would swallow
          // the grip's grab zone. This wrapper is the click zone instead.
          "rounded-full transition-transform after:hidden active:scale-90",
          task.done && "animate-in zoom-in-75 duration-300",
          overdue && !task.done && "border-destructive dark:border-destructive",
        )}
        aria-label={`Mark "${task.title}" as ${task.done ? "not done" : "done"}`}
      />
    </span>
  );
}

function DeadlineChip({
  task,
  placeholder,
}: {
  task: TaskWithMeta;
  /** Render "No date" instead of nothing, so the slot never collapses. */
  placeholder?: boolean;
}) {
  if (!task.deadline) {
    if (!placeholder) return null;
    return (
      <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground/50">
        <CalendarClock className="size-3.5" />
        No date
      </span>
    );
  }
  const overdue = dueBucket(task) === "overdue" && !task.done;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs whitespace-nowrap",
        overdue ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      <CalendarClock className="size-3.5" />
      {format(deadlineDate(task.deadline), "MMM d")}
    </span>
  );
}

function AvatarStack({
  people,
  className = "w-14",
}: {
  people: Person[];
  /** A fixed width by default, so rows line up whoever is assigned. */
  className?: string;
}) {
  return (
    <span className={cn("flex justify-end -space-x-1.5", className)}>
      {people.slice(0, 2).map((person) => (
        <UserAvatar
          key={person.id}
          person={person}
          className="size-5 ring-2 ring-background"
        />
      ))}
      {people.length > 2 ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-background">
          +{people.length - 2}
        </span>
      ) : null}
    </span>
  );
}

export function TaskRow({
  task,
  showProject,
  projectColor,
  className,
  onToggleDone,
  handle,
}: {
  task: TaskWithMeta;
  showProject: boolean;
  /** Washes the project badge in the project's color. */
  projectColor: string | null;
  className?: string;
  onToggleDone: (done: boolean) => void;
  /** Omitted on the drag overlay, which shows a static grip. */
  handle?: DragHandleProps;
}) {
  return (
    <div
      className={cn(
        "group/row flex w-full cursor-default items-center gap-3 rounded-lg border bg-background py-3 pr-4 pl-1.5 text-left select-none hover:bg-task-hover",
        className,
      )}
    >
      {/* The grip's grab zone runs from the row's left edge to halfway
          between its visible dots and the checkbox; the checkbox's click zone
          takes over from there. The grip icon's dots are ~6px wide inside a
          16px button, so its own layout edge is that halfway point, and
          negative margins pull each zone across the padding and gap without
          moving anything. */}
      <DragHandle
        handle={handle}
        label={`Drag "${task.title}"`}
        className={cn("-ml-1.5 w-5.5 pl-1.5", !handle && "opacity-100")}
      />
      <DoneCheckbox
        task={task}
        onToggleDone={onToggleDone}
        className="-my-3 -ml-3 -mr-3 self-stretch py-3 pr-3 pl-1.5"
      />
      <TruncatedText
        text={task.title}
        disabled={!handle}
        className={cn(
          "min-w-0 flex-1 text-sm",
          task.done && "text-muted-foreground line-through",
        )}
      />
      {showProject ? (
        <span className="flex w-36 justify-end">
          {task.projectName ? (
            <ProjectBadge
              name={task.projectName}
              color={projectColor}
              className="max-w-36"
            />
          ) : null}
        </span>
      ) : null}
      <span className="flex w-16 items-center justify-end">
        <DeadlineChip task={task} />
      </span>
      <AvatarStack people={task.assignees} />
    </div>
  );
}

/**
 * Kanban card, also the calendar's card. Every slot renders whether or not
 * the task fills it — project top right, date bottom left, assignees bottom
 * right — so cards in a column line up identically whatever data they carry.
 * On the calendar, where the column already says the day, the date's slot
 * holds the project instead, and a late task is told by its circle.
 */
export function TaskCard({
  task,
  showProject,
  projectColor,
  showDate = true,
  className,
  onToggleDone,
  handle,
}: {
  task: TaskWithMeta;
  showProject: boolean;
  showDate?: boolean;
  /** Washes the project badge in the project's color. */
  projectColor: string | null;
  className?: string;
  onToggleDone: (done: boolean) => void;
  /** Omitted on the drag overlay, which shows a static grip. */
  handle?: DragHandleProps;
}) {
  return (
    <div
      className={cn(
        "group/row flex cursor-default items-start gap-2.5 rounded-lg border bg-background py-3.5 pr-4 pl-1.5 shadow-xs select-none hover:bg-task-hover",
        className,
      )}
    >
      {/* Same grab/click zone split as in `TaskRow`. */}
      <DragHandle
        handle={handle}
        label={`Drag "${task.title}"`}
        className={cn("-my-0.5 -ml-1.5 w-5.5 pl-1.5", !handle && "opacity-100")}
      />
      {/* Stretches the click zone down the card's left edge and across the
          gaps on both sides. */}
      <DoneCheckbox
        task={task}
        onToggleDone={onToggleDone}
        overdue={!showDate && dueBucket(task) === "overdue"}
        className="-my-3.5 -ml-2.5 -mr-2.5 items-start self-stretch py-3.5 pr-2.5 pl-1.5 [&>*]:mt-0.5"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex items-center gap-2">
          <TruncatedText
            text={task.title}
            disabled={!handle}
            className={cn(
              "min-w-0 flex-1 text-sm font-medium",
              task.done && "text-muted-foreground line-through",
            )}
          />
          {showProject && showDate ? (
            <ProjectBadge
              name={task.projectName ?? "—"}
              color={projectColor}
              className={cn("max-w-32 shrink-0", !task.projectName && "invisible")}
            />
          ) : null}
        </span>
        {/* Fixed height: an avatar is taller than the date's text line, and
            the card must not grow when someone is assigned. */}
        <span className="flex h-5 min-w-0 items-center gap-2">
          {showDate ? (
            <DeadlineChip task={task} placeholder />
          ) : showProject && task.projectName ? (
            <ProjectBadge
              name={task.projectName}
              color={projectColor}
              className="min-w-0 shrink"
            />
          ) : null}
          <span className="ml-auto shrink-0">
            {/* Beside the project, the stack takes only what it needs. */}
            <AvatarStack
              people={task.assignees}
              className={showDate ? undefined : ""}
            />
          </span>
        </span>
      </span>
    </div>
  );
}
