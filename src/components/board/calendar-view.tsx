"use client";

import {
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  isSameDay,
  isSameMonth,
  isSameYear,
  isWeekend,
  startOfMonth,
  startOfToday,
  startOfWeek,
} from "date-fns";
import {
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  Plus,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { TaskCard } from "@/components/board/task-items";
import {
  calendarDayDropId,
  UNSCHEDULED_DROP_ID,
  useTaskDnd,
} from "@/components/task-dnd";
import { TruncatedText } from "@/components/truncated-text";
import { UserAvatar } from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tintStyle } from "@/lib/appearance";
import { deadlineDate, toDeadline } from "@/lib/deadline";
import { cachedPref, savePref, storedPref } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import type { Person, TaskWithMeta } from "@/lib/types";

type Span = "month" | "week";

/** Where a task is drawn — also its drag group, so ids stay unique when a
 * day's overflow popover lists a task that is visible in its cell too. */
type Variant = "month" | "week" | "more" | "unscheduled";

const WEEK = { weekStartsOn: 1 } as const;

const SPAN_KEY = "toodoo.calendar.span";
const PANEL_KEY = "toodoo.calendar.unscheduled";

/** Where the calendar was looking, kept for the tab's session only, so a
 * reload comes back to today. */
const CURSOR_KEY = "toodoo.calendar.cursor";

/** A month cell's day header (with its top padding and the gap below it),
 * chip pitch (a chip and the gap after it) and bottom padding, in px. */
const MONTH_CELL_HEADER = 28;
const MONTH_CHIP_PITCH = 24;
const MONTH_CHIP_GAP = 2;
const MONTH_CELL_PADDING = 6;

function rangeTitle(span: Span, start: Date, end: Date) {
  if (span === "month") return format(start, "MMMM yyyy");
  if (!isSameYear(start, end)) {
    return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
  }
  if (!isSameMonth(start, end)) {
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }
  return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
}

/** Ignore shortcuts typed into a field or a dialog. */
function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]',
    ) !== null
  );
}

/**
 * The board laid out by deadline: a month grid or a week of columns, with the
 * tasks that have no deadline in a side panel. Tasks are dragged between days
 * to reschedule them, onto the panel to clear their deadline, or onto a
 * project in the sidebar to move them, as everywhere else.
 */
export function CalendarView({
  tasks,
  showDone,
  onSetDone,
  onOpen,
  onCreate,
  neutral,
}: {
  /** Already filtered and sorted; a day lists its tasks in this order. */
  tasks: TaskWithMeta[];
  showDone: boolean;
  onSetDone: (taskId: string, done: boolean) => void;
  onOpen: (task: TaskWithMeta) => void;
  onCreate: (deadline: string | null) => void;
  /** Leave tasks uncolored — on a project's own page every task would wear
   * the same color, which tells nobody anything. */
  neutral?: boolean;
}) {
  const { projectsById } = useWorkspace();
  const { activeTask, activeGroupKey } = useTaskDnd();

  const today = useMemo(() => startOfToday(), []);
  // Each board mounts its own calendar; these carry over from the last one.
  const [span, setSpanState] = useState<Span>(() =>
    cachedPref(SPAN_KEY) === "week" ? "week" : "month",
  );
  const [cursor, setCursorState] = useState(() => {
    const day = cachedPref(CURSOR_KEY);
    return day ? deadlineDate(day) : today;
  });
  const [panelOpen, setPanelOpenState] = useState(
    () => cachedPref(PANEL_KEY) !== "closed",
  );

  // On a fresh page these come from an earlier visit, after mount.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore of per-viewer preferences */
    if (storedPref(SPAN_KEY) === "week") setSpanState("week");
    if (storedPref(PANEL_KEY) === "closed") setPanelOpenState(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setSpan = useCallback((next: Span) => {
    setSpanState(next);
    savePref(SPAN_KEY, next);
  }, []);
  const setPanelOpen = useCallback((open: boolean) => {
    setPanelOpenState(open);
    savePref(PANEL_KEY, open ? "open" : "closed");
  }, []);
  const setCursor = useCallback((update: Date | ((current: Date) => Date)) => {
    setCursorState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      savePref(CURSOR_KEY, toDeadline(next), false);
      return next;
    });
  }, []);

  const step = useCallback(
    (direction: 1 | -1) =>
      setCursor((current) =>
        span === "month"
          ? addMonths(startOfMonth(current), direction)
          : addWeeks(current, direction),
      ),
    [span, setCursor],
  );

  const { start, end, days } = useMemo(() => {
    const first = span === "month" ? startOfMonth(cursor) : cursor;
    const last = span === "month" ? endOfMonth(cursor) : cursor;
    const gridStart = startOfWeek(first, WEEK);
    const gridEnd = endOfWeek(last, WEEK);
    return {
      start: span === "month" ? first : gridStart,
      end: span === "month" ? last : gridEnd,
      days: eachDayOfInterval({ start: gridStart, end: gridEnd }),
    };
  }, [span, cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, TaskWithMeta[]>();
    for (const task of tasks) {
      if (!task.deadline) continue;
      const list = map.get(task.deadline) ?? [];
      list.push(task);
      map.set(task.deadline, list);
    }
    return map;
  }, [tasks]);

  const unscheduled = useMemo(
    () => tasks.filter((task) => !task.deadline),
    [tasks],
  );

  const stats = useMemo(() => {
    const from = toDeadline(start);
    const to = toDeadline(end);
    let due = 0;
    let done = 0;
    for (const task of tasks) {
      if (!task.deadline) continue;
      if (task.deadline < from || task.deadline > to) continue;
      due += 1;
      if (task.done) done += 1;
    }
    return { due, done };
  }, [tasks, start, end]);

  // ← / → step through periods, T comes back to today, M and W switch spans.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || activeTask) return;
      if (isTypingTarget(event.target)) return;
      switch (event.key) {
        case "ArrowLeft":
          step(-1);
          break;
        case "ArrowRight":
          step(1);
          break;
        case "t":
        case "T":
          setCursor(today);
          break;
        case "m":
        case "M":
          setSpan("month");
          break;
        case "w":
        case "W":
          setSpan("week");
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, today, setSpan, setCursor, activeTask]);

  const colorOf = useCallback(
    (task: TaskWithMeta) =>
      (!neutral &&
        task.projectId &&
        projectsById.get(task.projectId)?.color) ||
      null,
    [projectsById, neutral],
  );

  const chipProps = {
    today,
    showDone,
    onSetDone,
    onOpen,
    colorOf,
    showProject: !neutral,
  };

  const openWeek = useCallback(
    (day: Date) => {
      setCursor(day);
      setSpan("week");
    },
    [setSpan, setCursor],
  );

  const showingToday =
    span === "month"
      ? isSameMonth(cursor, today)
      : days.some((day) => isSameDay(day, today));

  return (
    <div className="flex min-h-0 flex-1 gap-4 px-6 pt-2 pb-6">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
          <h2 className="text-base font-semibold tracking-tight tabular-nums">
            {rangeTitle(span, start, end)}
          </h2>
          {span === "week" ? (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              W{getISOWeek(start)}
            </span>
          ) : null}
          <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <span>
              {stats.due} {stats.due === 1 ? "task" : "tasks"}
            </span>
            {showDone && stats.done > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>{stats.done} done</span>
              </>
            ) : null}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={span === "month" ? "Previous month" : "Previous week"}
                title="Previous (←)"
                onClick={() => step(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="sm"
                title="Today (T)"
                disabled={showingToday && isSameDay(cursor, today)}
                onClick={() => setCursor(today)}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={span === "month" ? "Next month" : "Next week"}
                title="Next (→)"
                onClick={() => step(1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <Tabs value={span} onValueChange={(value) => setSpan(value as Span)}>
              {/* Equal columns: every option as wide as the widest. */}
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="month" title="Month (M)">
                  Month
                </TabsTrigger>
                <TabsTrigger value="week" title="Week (W)">
                  Week
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={panelOpen ? "Hide tasks without a date" : "Show tasks without a date"}
              aria-pressed={panelOpen}
              title={panelOpen ? "Hide “No date”" : "Show “No date”"}
              onClick={() => setPanelOpen(!panelOpen)}
              className="relative"
            >
              {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
              {!panelOpen && unscheduled.length > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground tabular-nums">
                  {unscheduled.length}
                </span>
              ) : null}
            </Button>
          </div>
        </header>

        {span === "month" ? (
          <MonthGrid
            days={days}
            month={cursor}
            byDay={byDay}
            onCreate={onCreate}
            onOpenWeek={openWeek}
            chipProps={chipProps}
          />
        ) : (
          <WeekColumns
            days={days}
            byDay={byDay}
            onCreate={onCreate}
            chipProps={chipProps}
          />
        )}
      </div>

      {panelOpen ? (
        <UnscheduledPanel
          tasks={unscheduled}
          onCreate={() => onCreate(null)}
          chipProps={chipProps}
        />
      ) : null}

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div inert className="pointer-events-none cursor-grabbing opacity-90">
            <TaskChip
              task={activeTask}
              variant={
                (activeGroupKey?.replace("calendar-", "") as Variant) ?? "month"
              }
              {...chipProps}
              overlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </div>
  );
}

type ChipProps = {
  today: Date;
  showDone: boolean;
  onSetDone: (taskId: string, done: boolean) => void;
  onOpen: (task: TaskWithMeta) => void;
  colorOf: (task: TaskWithMeta) => string | null;
  /** Off on a project's own page, where every task is in that project. */
  showProject: boolean;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The narrowest a day may get and still show its tasks readably; below it the
// calendar scrolls sideways rather than squeezing them. Month: a 2rem gutter
// for week numbers plus seven 9rem days. Week: seven 12rem days, room for a
// kanban card's grip, circle, title and badge.
const MONTH_MIN_WIDTH = "min-w-[65rem]";
const WEEK_MIN_WIDTH = "min-w-[84rem]";

function MonthGrid({
  days,
  month,
  byDay,
  onCreate,
  onOpenWeek,
  chipProps,
}: {
  days: Date[];
  month: Date;
  byDay: Map<string, TaskWithMeta[]>;
  onCreate: (deadline: string) => void;
  onOpenWeek: (day: Date) => void;
  chipProps: ChipProps;
}) {
  const weeks = useMemo(() => {
    const rows: Date[][] = [];
    for (let index = 0; index < days.length; index += 7) {
      rows.push(days.slice(index, index + 7));
    }
    return rows;
  }, [days]);

  // Every cell is as tall as the others, so one tells how many chips fit.
  const [probe, setProbe] = useState<HTMLDivElement | null>(null);
  const [capacity, setCapacity] = useState(3);
  useLayoutEffect(() => {
    if (!probe) return;
    const measure = () => {
      const room = probe.clientHeight - MONTH_CELL_HEADER - MONTH_CELL_PADDING;
      // The last chip has no gap after it.
      setCapacity(
        Math.max(1, Math.floor((room + MONTH_CHIP_GAP) / MONTH_CHIP_PITCH)),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [probe]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border">
      <div className={cn("flex flex-1 flex-col", MONTH_MIN_WIDTH)}>
        <div className="sticky top-0 z-10 grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] border-b bg-background">
          <span aria-hidden />
          {WEEKDAYS.map((weekday, index) => (
            <span
              key={weekday}
              className={cn(
                "px-2 py-1.5 text-xs font-medium text-muted-foreground",
                index >= 5 && "text-muted-foreground/70",
              )}
            >
              {weekday}
            </span>
          ))}
        </div>
        <div
          className="grid flex-1 grid-cols-[2rem_repeat(7,minmax(0,1fr))]"
          style={{
            gridTemplateRows: `repeat(${weeks.length}, minmax(7rem, 1fr))`,
          }}
        >
          {weeks.map((week, row) => (
            <WeekRow
              key={toDeadline(week[0])}
              week={week}
              month={month}
              byDay={byDay}
              capacity={capacity}
              probe={row === 0 ? setProbe : undefined}
              last={row === weeks.length - 1}
              onCreate={onCreate}
              onOpenWeek={onOpenWeek}
              chipProps={chipProps}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekRow({
  week,
  month,
  byDay,
  capacity,
  probe,
  last,
  onCreate,
  onOpenWeek,
  chipProps,
}: {
  week: Date[];
  month: Date;
  byDay: Map<string, TaskWithMeta[]>;
  capacity: number;
  probe?: (element: HTMLDivElement | null) => void;
  last: boolean;
  onCreate: (deadline: string) => void;
  onOpenWeek: (day: Date) => void;
  chipProps: ChipProps;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onOpenWeek(week[0])}
        title={`Open week ${getISOWeek(week[0])}`}
        className={cn(
          "flex justify-center pt-2 text-[11px] text-muted-foreground/60 tabular-nums transition-colors hover:bg-muted/60 hover:text-foreground",
          !last && "border-b",
        )}
      >
        {getISOWeek(week[0])}
      </button>
      {week.map((day, column) => (
        <MonthCell
          key={toDeadline(day)}
          day={day}
          inMonth={isSameMonth(day, month)}
          tasks={byDay.get(toDeadline(day)) ?? []}
          capacity={capacity}
          cellRef={column === 0 ? probe : undefined}
          bottomBorder={!last}
          onCreate={onCreate}
          onOpenWeek={onOpenWeek}
          chipProps={chipProps}
        />
      ))}
    </>
  );
}

function MonthCell({
  day,
  inMonth,
  tasks,
  capacity,
  cellRef,
  bottomBorder,
  onCreate,
  onOpenWeek,
  chipProps,
}: {
  day: Date;
  inMonth: boolean;
  tasks: TaskWithMeta[];
  capacity: number;
  cellRef?: (element: HTMLDivElement | null) => void;
  bottomBorder: boolean;
  onCreate: (deadline: string) => void;
  onOpenWeek: (day: Date) => void;
  chipProps: ChipProps;
}) {
  const key = toDeadline(day);
  const { isOver, setNodeRef } = useDayDrop(key);
  const isToday = isSameDay(day, chipProps.today);
  const isPast = day < chipProps.today;

  // When everything doesn't fit, the last line becomes "+N more".
  const overflow = tasks.length > capacity;
  const visible = overflow ? tasks.slice(0, Math.max(0, capacity - 1)) : tasks;
  const hidden = tasks.length - visible.length;

  return (
    <div
      ref={(element) => {
        setNodeRef(element);
        cellRef?.(element);
      }}
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) onCreate(key);
      }}
      className={cn(
        "group/day relative flex min-h-0 min-w-0 flex-col gap-0.5 border-l px-1.5 pt-1 pb-1.5 transition-colors",
        bottomBorder && "border-b",
        isWeekend(day) && "bg-muted/25",
        !inMonth && "bg-muted/40",
      )}
    >
      <DropHighlight show={isOver} />
      <div className="pointer-events-none relative flex h-6 shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={() => onOpenWeek(day)}
          title={`Open the week of ${format(day, "MMMM d")}`}
          className={cn(
            "pointer-events-auto flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs tabular-nums transition-colors hover:bg-muted",
            !inMonth && "text-muted-foreground/60",
            inMonth && isPast && "text-muted-foreground",
            isToday &&
              "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
          )}
        >
          {day.getDate() === 1 ? format(day, "MMM d") : day.getDate()}
        </button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Add a task on ${format(day, "MMMM d")}`}
          onClick={() => onCreate(key)}
          className="pointer-events-auto opacity-0 transition-opacity group-hover/day:opacity-100 focus-visible:opacity-100"
        >
          <Plus />
        </Button>
      </div>
      {visible.map((task) => (
        <TaskChip key={task.id} task={task} variant="month" {...chipProps} />
      ))}
      {overflow ? (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="relative h-5.5 shrink-0 rounded-md px-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              />
            }
          >
            +{hidden} more
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 gap-1.5 p-2">
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
              {format(day, "EEEE, MMMM d")}
            </p>
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {tasks.map((task) => (
                <TaskChip
                  key={task.id}
                  task={task}
                  variant="more"
                  {...chipProps}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

function WeekColumns({
  days,
  byDay,
  onCreate,
  chipProps,
}: {
  days: Date[];
  byDay: Map<string, TaskWithMeta[]>;
  onCreate: (deadline: string) => void;
  chipProps: ChipProps;
}) {
  return (
    <div className="flex min-h-0 flex-1 overflow-auto rounded-lg border">
      <div
        className={cn(
          "grid flex-1 grid-cols-7 grid-rows-[minmax(0,1fr)]",
          WEEK_MIN_WIDTH,
        )}
      >
        {days.map((day, index) => (
          <WeekColumn
            key={toDeadline(day)}
            day={day}
            first={index === 0}
            tasks={byDay.get(toDeadline(day)) ?? []}
            onCreate={onCreate}
            chipProps={chipProps}
          />
        ))}
      </div>
    </div>
  );
}

function WeekColumn({
  day,
  first,
  tasks,
  onCreate,
  chipProps,
}: {
  day: Date;
  first: boolean;
  tasks: TaskWithMeta[];
  onCreate: (deadline: string) => void;
  chipProps: ChipProps;
}) {
  const key = toDeadline(day);
  const { isOver, setNodeRef } = useDayDrop(key);
  const isToday = isSameDay(day, chipProps.today);
  const isPast = day < chipProps.today;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/day relative flex min-h-0 min-w-0 flex-col transition-colors",
        !first && "border-l",
        isWeekend(day) && "bg-muted/25",
      )}
    >
      <DropHighlight show={isOver} />
      <div className="relative flex items-center gap-1.5 border-b px-2.5 py-2.5">
        <span
          className={cn(
            "text-xs font-medium text-muted-foreground uppercase",
            isToday && "text-foreground",
          )}
        >
          {format(day, "EEE")}
        </span>
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
            isPast && !isToday && "text-muted-foreground",
            isToday && "bg-primary text-primary-foreground",
          )}
        >
          {day.getDate()}
        </span>
        {tasks.length > 0 ? (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {tasks.length}
          </span>
        ) : null}
      </div>
      <div
        className="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2"
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) onCreate(key);
        }}
      >
        {tasks.map((task) => (
          <TaskChip key={task.id} task={task} variant="week" {...chipProps} />
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCreate(key)}
          className={cn(
            "justify-start text-muted-foreground transition-opacity",
            tasks.length > 0 &&
              "opacity-0 group-hover/day:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Plus />
          Add task
        </Button>
      </div>
    </div>
  );
}

function UnscheduledPanel({
  tasks,
  onCreate,
  chipProps,
}: {
  tasks: TaskWithMeta[];
  onCreate: () => void;
  chipProps: ChipProps;
}) {
  const { activeTask } = useTaskDnd();
  const { isOver, setNodeRef } = useDroppable({
    id: UNSCHEDULED_DROP_ID,
    disabled: !activeTask,
  });
  // Only a task with a date has anywhere to go here.
  const accepts = activeTask !== null && activeTask.deadline !== null;

  return (
    <aside
      ref={setNodeRef}
      className={cn(
        "hidden w-72 shrink-0 flex-col rounded-xl bg-muted/50 transition-all duration-150 lg:flex",
        accepts && "ring-1 ring-border",
        accepts && isOver && "bg-accent ring-2 ring-ring/40",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <CalendarOff className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">No date</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {tasks.length}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Add a task without a date"
          onClick={onCreate}
          className="ml-auto"
        >
          <Plus />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 pt-0">
        {tasks.map((task) => (
          <TaskChip
            key={task.id}
            task={task}
            variant="unscheduled"
            {...chipProps}
          />
        ))}
        <p
          className={cn(
            "rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground/80",
            tasks.length > 0 && !accepts && "hidden",
          )}
        >
          {accepts
            ? "Drop here to clear the date"
            : "Drag a task onto a day to schedule it, or here to clear its date."}
        </p>
      </div>
    </aside>
  );
}

/** Where a dragged task would land, drawn inside the day's borders rather
 * than flush against them. The day's own content sits above it. */
function DropHighlight({ show }: { show: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-1 rounded-lg bg-accent ring-1 ring-ring/30 transition-opacity duration-150",
        show ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

function useDayDrop(day: string) {
  const { activeTask } = useTaskDnd();
  const { isOver, setNodeRef } = useDroppable({
    id: calendarDayDropId(day),
    disabled: !activeTask,
  });
  // Hovering the day a task is already on changes nothing; don't promise it.
  return { isOver: isOver && activeTask?.deadline !== day, setNodeRef };
}

/**
 * A task on the calendar. In a month cell it is a one-line chip washed with
 * its project's color; in a week column and the "No date" panel, a kanban-like
 * card with the project's badge and the assignees. The whole chip drags (past the
 * sensor's few pixels — a plain click opens the task), and its circle checks
 * the task off after a beat, so the tick is seen before it leaves.
 */
function TaskChip({
  task,
  variant,
  today,
  showDone,
  onSetDone,
  onOpen,
  colorOf,
  showProject,
  overlay,
}: ChipProps & {
  task: TaskWithMeta;
  variant: Variant;
  /** The copy that follows the pointer: no drag wiring of its own. */
  overlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useDraggable({
    id: `calendar-${variant}::${task.id}`,
    data: { kind: "task", task, groupKey: `calendar-${variant}` },
    disabled: overlay,
  });

  const [localDone, setLocalDone] = useState(false);
  const beat = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (beat.current) clearTimeout(beat.current);
    },
    [],
  );
  const done = task.done || localDone;

  function toggle() {
    if (beat.current) {
      clearTimeout(beat.current);
      beat.current = null;
    }
    if (task.done || showDone) {
      setLocalDone(false);
      onSetDone(task.id, !task.done);
      return;
    }
    if (localDone) {
      setLocalDone(false);
      return;
    }
    setLocalDone(true);
    beat.current = setTimeout(() => {
      beat.current = null;
      onSetDone(task.id, true);
    }, 450);
  }

  const color = colorOf(task);
  // Late is told by the circle alone; the task keeps its project's color and
  // its title its usual ink.
  const overdue =
    !done && task.deadline !== null && task.deadline < toDeadline(today);
  const compact = variant === "month" || variant === "more";

  const check = (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`Mark "${task.title}" as ${done ? "not done" : "done"}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        toggle();
      }}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center rounded-full border transition-all active:scale-90",
        compact ? "size-3.5" : "size-4",
        done
          ? "border-primary bg-primary text-primary-foreground"
          : overdue
            ? "border-destructive bg-background"
            : "border-foreground/30 bg-background hover:border-foreground/60",
        overdue && !compact && "border-[1.5px]",
      )}
    >
      {done ? (
        <Check
          className={cn(
            "animate-in zoom-in-50 duration-200",
            compact ? "size-2.5" : "size-3",
          )}
          strokeWidth={3}
        />
      ) : null}
    </button>
  );

  const shared = {
    ref: overlay ? undefined : setNodeRef,
    ...(overlay ? {} : attributes),
    ...(overlay ? {} : listeners),
    onClick: () => onOpen(task),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen(task);
      }
    },
  };
  const titleClass = cn(
    "min-w-0 flex-1",
    done && "text-muted-foreground line-through",
  );

  if (compact) {
    // One line in the project's color (neutral without one).
    return (
      <div
        {...shared}
        className={cn(
          "relative flex h-5.5 shrink-0 cursor-default touch-none items-center gap-1.5 overflow-hidden rounded-md bg-background px-1.5 text-left text-xs outline-none select-none hover:bg-task-hover focus-visible:ring-2 focus-visible:ring-ring/50",
          isDragging && "opacity-30",
          overlay && "shadow-lg ring-1 ring-border",
        )}
        style={tintStyle(color)}
      >
        {check}
        <TruncatedText
          text={task.title}
          disabled={overlay}
          className={titleClass}
        />
        {task.assignees.length > 0 && variant === "more" ? (
          <Avatars people={task.assignees} size="sm" />
        ) : null}
      </div>
    );
  }

  // In a week column and the "No date" panel: the kanban card itself, dragged
  // by its grip like everywhere else.
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      onClick={() => onOpen(task)}
      className={cn("shrink-0", isDragging && "opacity-30")}
    >
      <TaskCard
        task={done === task.done ? task : { ...task, done }}
        showProject={showProject}
        projectColor={color}
        showDate={false}
        onToggleDone={toggle}
        handle={
          overlay
            ? undefined
            : { ref: setActivatorNodeRef, listeners, attributes }
        }
        className={overlay ? "shadow-lg ring-1 ring-border" : undefined}
      />
    </div>
  );
}

function Avatars({
  people,
  size = "md",
}: {
  people: Person[];
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-4" : "size-5";
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {people.slice(0, 3).map((person) => (
        <UserAvatar
          key={person.id}
          person={person}
          className={cn(box, "ring-2 ring-background")}
          textClassName="text-[9px]"
        />
      ))}
      {people.length > 3 ? (
        <span
          className={cn(
            box,
            "flex items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground ring-2 ring-background",
          )}
        >
          +{people.length - 3}
        </span>
      ) : null}
    </span>
  );
}

