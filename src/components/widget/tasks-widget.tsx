"use client";

import {
  AppWindow,
  Bookmark,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Hash,
  Inbox,
  Pin,
  PinOff,
  Plus,
  UserRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { createTask, setTaskDone } from "@/actions/tasks";
import { dueBucket } from "@/components/board/grouping";
import { DoneCheckbox } from "@/components/board/task-items";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DEFAULT_SCOPE,
  dueLabel,
  newTaskFields,
  parseScope,
  scopeKey,
  scopeTasks,
  type WidgetScope,
} from "@/components/widget/scope";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { AppearanceIcon } from "@/lib/appearance";
import {
  desktopWidgetUrl,
  sendToDesktop,
  useDesktopShell,
} from "@/lib/desktop-shell";
import { newId } from "@/lib/ids";
import { savePref, usePref } from "@/lib/prefs";
import type { TaskWithMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { addTask, patchTask } from "@/lib/workspace";

/** Which list the widget shows, kept for the next time it opens. */
const SCOPE_KEY = "toodoo.widget.scope";
/** "0" once the user let the window sink behind others; it floats otherwise. */
const PINNED_KEY = "toodoo.widget.pinned";
/** How long a task just ticked stays listed, struck through, to be unticked. */
const LINGER_MS = 4000;
/**
 * The desktop app rolls the window up to its 40px header (WIDGET_HEADER_HEIGHT
 * in desktop/src-tauri/src/lib.rs). The window's height is the only record of
 * that, so the page follows it: at this height or less there is no room for a
 * list, and dragging the window taller brings the list back.
 */
const COLLAPSED_MAX_HEIGHT = 56;

function subscribeToResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function useCollapsed() {
  return useSyncExternalStore(
    subscribeToResize,
    () => window.innerHeight <= COLLAPSED_MAX_HEIGHT,
    () => false,
  );
}

/**
 * A simplified view of the user's tasks, for a small window that stays on
 * screen beside whatever else they are doing: tick tasks off, add one, switch
 * list. It is a page of its own (`/widget`) on the same workspace data as the
 * app, so it is the same in the desktop app's floating window and in a
 * browser popup; only the window controls differ.
 */
export function TasksWidget() {
  const { me, tasks, projects, views, projectsById, viewsById, mutate } =
    useWorkspace();
  // Pinning and rolling up are the shell's to do; a browser popup has neither.
  const floats = useDesktopShell()?.widget === true;
  const collapsed = useCollapsed();

  const storedScope = usePref(SCOPE_KEY);
  const scope = useMemo<WidgetScope>(() => {
    const parsed = parseScope(storedScope);
    // A project left or a view deleted since: back to the default.
    if (parsed.kind === "project" && !projectsById.has(parsed.id)) {
      return DEFAULT_SCOPE;
    }
    if (parsed.kind === "view" && !viewsById.has(parsed.id)) {
      return DEFAULT_SCOPE;
    }
    return parsed;
  }, [storedScope, projectsById, viewsById]);
  const view = scope.kind === "view" ? viewsById.get(scope.id) : undefined;
  const label =
    scope.kind === "mine"
      ? "My tasks"
      : scope.kind === "all"
        ? "All tasks"
        : scope.kind === "project"
          ? (projectsById.get(scope.id)?.name ?? "Project")
          : (view?.name ?? "View");

  const pinned = usePref(PINNED_KEY) !== "0";
  // The shell opens the window floating; it is told whenever the preference
  // says otherwise — once the window is up, and on every toggle after.
  const shellPinned = useRef(true);
  useEffect(() => {
    if (!floats || shellPinned.current === pinned) return;
    shellPinned.current = pinned;
    sendToDesktop(desktopWidgetUrl(pinned ? "pin" : "unpin"));
  }, [floats, pinned]);

  // Tasks ticked here stay listed for a moment, so a slip can be unticked.
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  const toggleDone = useCallback(
    (taskId: string, done: boolean) => {
      clearTimeout(timers.current.get(taskId));
      timers.current.delete(taskId);
      const linger = (keep: boolean) =>
        setLingering((current) => {
          const next = new Set(current);
          if (keep) next.add(taskId);
          else next.delete(taskId);
          return next;
        });
      linger(done);
      if (done) {
        timers.current.set(
          taskId,
          setTimeout(() => {
            timers.current.delete(taskId);
            linger(false);
          }, LINGER_MS),
        );
      }
      void mutate({
        optimistic: patchTask(taskId, { done }),
        action: () => setTaskDone(taskId, done),
        failure: "Could not update the task",
      });
    },
    [mutate],
  );

  const listed = useMemo(
    () => scopeTasks(scope, tasks, { meId: me.id, view, keepDone: lingering }),
    [scope, tasks, me.id, view, lingering],
  );
  const openCount = listed.filter((task) => !task.done).length;

  const [title, setTitle] = useState("");
  function addNewTask(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const fields = newTaskFields(scope, view);
    // A view may still filter on a project the user has since left.
    const project = fields.projectId
      ? (projectsById.get(fields.projectId) ?? null)
      : null;
    const id = newId();
    void mutate({
      optimistic: addTask({
        id,
        title: trimmed,
        description: null,
        done: false,
        deadline: fields.deadline,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        // Top of the manual order, as the server places it.
        position: Math.min(1, ...tasks.map((task) => task.position)) - 1,
        createdBy: me.id,
        createdAt: new Date(),
        assignees: fields.assignMe ? [me] : [],
      }),
      action: () =>
        createTask({
          id,
          title: trimmed,
          deadline: fields.deadline,
          projectId: project?.id ?? null,
          assigneeIds: fields.assignMe ? [me.id] : [],
        }),
      failure: "Could not create the task",
      retry: true,
    });
    setTitle("");
  }

  function openApp() {
    if (floats) sendToDesktop(desktopWidgetUrl("app"));
    // A named tab, so a second click goes back to the one already open.
    else window.open("/", "toodoo-app")?.focus();
  }

  const count = (
    <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
      {openCount}
    </span>
  );

  return (
    <div className="flex h-dvh cursor-default flex-col bg-background select-none">
      {/* The window's title bar in the desktop app: dragging it moves the
          window, and on macOS the traffic lights float over its left end. */}
      <header
        data-tauri-drag-region="deep"
        className={cn(
          "flex h-10 shrink-0 items-center gap-0.5 pr-1.5 pl-1.5 desktop-macos:pl-[72px]",
          !collapsed && "border-b",
        )}
      >
        {collapsed ? (
          // No room for a menu under a rolled-up window.
          <span className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-sm font-medium">
            <span className="truncate">{label}</span>
            {count}
          </span>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0 shrink justify-start gap-1.5 px-2 text-sm"
                />
              }
            >
              <span className="truncate">{label}</span>
              {count}
              <ChevronDown className="text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 max-w-[calc(100vw-1rem)]">
              <DropdownMenuRadioGroup
                value={scopeKey(scope)}
                onValueChange={(value) => savePref(SCOPE_KEY, String(value))}
              >
                <DropdownMenuRadioItem value="mine" closeOnClick>
                  <UserRound className="text-muted-foreground" />
                  My tasks
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="all" closeOnClick>
                  <Inbox className="text-muted-foreground" />
                  All tasks
                </DropdownMenuRadioItem>
                {projects.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Projects</DropdownMenuLabel>
                      {projects.map((project) => (
                        <DropdownMenuRadioItem
                          key={project.id}
                          value={scopeKey({ kind: "project", id: project.id })}
                          closeOnClick
                        >
                          <AppearanceIcon
                            icon={project.icon}
                            color={project.color}
                            fallback={Hash}
                            className="text-muted-foreground"
                          />
                          <span className="truncate">{project.name}</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuGroup>
                  </>
                ) : null}
                {views.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Views</DropdownMenuLabel>
                      {views.map((saved) => (
                        <DropdownMenuRadioItem
                          key={saved.id}
                          value={scopeKey({ kind: "view", id: saved.id })}
                          closeOnClick
                        >
                          <AppearanceIcon
                            icon={saved.icon}
                            color={saved.color}
                            fallback={Bookmark}
                            className="text-muted-foreground"
                          />
                          <span className="truncate">{saved.name}</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuGroup>
                  </>
                ) : null}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <span className="ml-auto flex shrink-0 items-center">
          {floats ? (
            <>
              <HeaderButton
                label={pinned ? "Stop keeping on top" : "Keep on top"}
                pressed={pinned}
                onClick={() => savePref(PINNED_KEY, pinned ? "0" : "1")}
              >
                {pinned ? <Pin className="fill-current" /> : <PinOff />}
              </HeaderButton>
              <HeaderButton
                label={collapsed ? "Expand" : "Collapse"}
                onClick={() =>
                  sendToDesktop(
                    desktopWidgetUrl(collapsed ? "expand" : "collapse"),
                  )
                }
              >
                {collapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
              </HeaderButton>
            </>
          ) : null}
          <HeaderButton label="Open toodoo" onClick={openApp}>
            <AppWindow />
          </HeaderButton>
        </span>
      </header>

      {collapsed ? null : (
        <>
          {listed.length > 0 ? (
            <ul className="min-h-0 flex-1 overflow-y-auto py-1">
              {listed.map((task) => (
                <WidgetTask
                  key={task.id}
                  task={task}
                  // Inside one project every task would carry the same dot.
                  projectColor={
                    scope.kind !== "project" && task.projectId
                      ? (projectsById.get(task.projectId)?.color ?? null)
                      : undefined
                  }
                  onToggleDone={toggleDone}
                />
              ))}
            </ul>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="text-sm font-medium">All clear</p>
              <p className="text-xs text-muted-foreground">
                Nothing left to do in {label}.
              </p>
            </div>
          )}

          <form
            onSubmit={addNewTask}
            className="flex h-10 shrink-0 items-center gap-2 border-t px-3"
          >
            <Plus className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add a task"
              aria-label={`Add a task to ${label}`}
              className="h-full min-w-0 flex-1 cursor-text bg-transparent text-[13px] outline-none select-text placeholder:text-muted-foreground"
            />
          </form>
        </>
      )}
    </div>
  );
}

function HeaderButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  /** For a toggle: whether it is on. */
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cn(
        "text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5",
        pressed && "text-foreground",
      )}
    >
      {children}
    </Button>
  );
}

function WidgetTask({
  task,
  projectColor,
  onToggleDone,
}: {
  task: TaskWithMeta;
  /** The task's project color (null when it has none); omitted to show no dot. */
  projectColor?: string | null;
  onToggleDone: (taskId: string, done: boolean) => void;
}) {
  const overdue = !task.done && dueBucket(task) === "overdue";
  return (
    <li className="flex items-start gap-2.5 px-3 py-1.5 hover:bg-task-hover">
      {/* The click zone runs to the row's edges, as on the boards. */}
      <DoneCheckbox
        task={task}
        onToggleDone={(done) => onToggleDone(task.id, done)}
        className="-my-1.5 -mr-2.5 -ml-3 items-start self-stretch py-1.5 pr-2.5 pl-3 [&>*]:mt-0.5"
      />
      <span
        className={cn(
          "line-clamp-2 min-w-0 flex-1 text-[13px] leading-5 break-words",
          task.done && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>
      {task.deadline ? (
        <span
          className={cn(
            "shrink-0 text-xs leading-5 whitespace-nowrap",
            overdue ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          {dueLabel(task.deadline)}
        </span>
      ) : null}
      {projectColor !== undefined ? (
        <span
          title={task.projectName ?? undefined}
          className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40"
          style={projectColor ? { backgroundColor: projectColor } : undefined}
        />
      ) : null}
    </li>
  );
}
