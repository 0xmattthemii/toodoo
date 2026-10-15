"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { cachedPref, savePref, storedPref } from "@/lib/prefs";

import {
  BOARD_MODES,
  DEFAULT_BOARD_CONFIG,
  type BoardConfig,
  type BoardFilter,
  type BoardMode,
  type GroupBy,
  type Person,
  type ProjectSummary,
  type SortBy,
  type TaskWithMeta,
} from "@/lib/types";

type BoardOptions = {
  projects: ProjectSummary[];
  people: Person[];
};

/** Fields a new task starts with, e.g. the day picked on the calendar. */
export type TaskDefaults = { deadline?: string };

type BoardContextValue = {
  config: BoardConfig;
  setMode: (mode: BoardMode) => void;
  setGroupBy: (groupBy: GroupBy) => void;
  setSortBy: (sortBy: SortBy) => void;
  addFilter: (filter: BoardFilter) => void;
  removeFilter: (filter: BoardFilter) => void;

  /** Dropdown options for filters and the task dialog. */
  options: BoardOptions;

  currentUserId: string;
  scopedProjectId?: string;

  /** Saved-view context: set on /views/[id] pages. */
  viewId?: string;
  dirty: boolean;
  markSaved: () => void;

  /** How many tasks the board shows once filtered, as reported by
   * `BoardContent`, for the toolbar's count. */
  visibleCount: number;
  setVisibleCount: (count: number) => void;

  /** Completed tasks are hidden by default. */
  showDone: boolean;
  setShowDone: (show: boolean) => void;

  dialogTask: TaskWithMeta | null;
  dialogDefaults: TaskDefaults;
  dialogOpen: boolean;
  openCreate: (defaults?: TaskDefaults) => void;
  openEdit: (task: TaskWithMeta) => void;
  setDialogOpen: (open: boolean) => void;
};

const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard() {
  const value = useContext(BoardContext);
  if (!value) throw new Error("useBoard must be used inside <BoardProvider>");
  return value;
}

/** Like useBoard, but usable outside a provider (e.g. view header actions). */
export function useBoardOptional() {
  return useContext(BoardContext);
}

/** The layout "All tasks" and the project boards share; a saved view keeps
 * its own. */
const MODE_KEY = "toodoo.board.mode";

function preferredMode(stored: string | null): BoardMode | null {
  return BOARD_MODES.includes(stored as BoardMode) ? (stored as BoardMode) : null;
}

/**
 * The board in `mode`. An ungrouped kanban is a single column, so the kanban
 * groups by deadline unless a grouping was chosen; leaving it drops that
 * grouping again if the switch is what added it.
 */
function switchMode(
  { config, autoGrouped }: { config: BoardConfig; autoGrouped: boolean },
  mode: BoardMode,
): { config: BoardConfig; autoGrouped: boolean } {
  if (mode === "kanban" && config.groupBy === "none") {
    return { config: { ...config, mode, groupBy: "deadline" }, autoGrouped: true };
  }
  if (mode !== "kanban" && autoGrouped && config.groupBy === "deadline") {
    return { config: { ...config, mode, groupBy: "none" }, autoGrouped: false };
  }
  return { config: { ...config, mode }, autoGrouped };
}

function normalize(config: BoardConfig) {
  return JSON.stringify({
    mode: config.mode,
    groupBy: config.groupBy,
    sortBy: config.sortBy,
    filters: [...config.filters].sort((a, b) =>
      `${a.field}:${a.value}`.localeCompare(`${b.field}:${b.value}`),
    ),
  });
}

export function BoardProvider({
  children,
  currentUserId,
  scopedProjectId,
  viewId,
  initialConfig,
  options,
}: {
  children: React.ReactNode;
  currentUserId: string;
  scopedProjectId?: string;
  viewId?: string;
  initialConfig?: BoardConfig;
  options: BoardOptions;
}) {
  const initial = initialConfig ?? DEFAULT_BOARD_CONFIG;
  // Boards that aren't a saved view open in whichever layout was last picked
  // on any of them, so moving between projects keeps the list, the kanban or
  // the calendar in front of you.
  const sharesMode = !viewId;
  // The config, and whether its deadline grouping was put there by switching
  // to the kanban rather than picked: only then does leaving the kanban take
  // it away again.
  const [board, setBoard] = useState<{
    config: BoardConfig;
    autoGrouped: boolean;
  }>(() => {
    const mode = sharesMode ? preferredMode(cachedPref(MODE_KEY)) : null;
    if (!mode) return { config: initial, autoGrouped: false };
    return switchMode({ config: initial, autoGrouped: false }, mode);
  });
  const config = board.config;
  const setConfig = useCallback(
    (update: BoardConfig | ((current: BoardConfig) => BoardConfig)) =>
      setBoard((current) => ({
        ...current,
        config: typeof update === "function" ? update(current.config) : update,
      })),
    [],
  );
  useEffect(() => {
    if (!sharesMode) return;
    const mode = preferredMode(storedPref(MODE_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a per-viewer choice the server render could not know
    if (mode) setBoard((current) => switchMode(current, mode));
  }, [sharesMode]);
  const [baseline, setBaseline] = useState(() => normalize(initial));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTask, setDialogTask] = useState<TaskWithMeta | null>(null);
  const [dialogDefaults, setDialogDefaults] = useState<TaskDefaults>({});
  const [showDone, setShowDone] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);

  // If the saved view is updated server-side, re-seed the local state.
  const [prevInitial, setPrevInitial] = useState(() => normalize(initial));
  const initialJson = normalize(initial);
  if (initialJson !== prevInitial) {
    setPrevInitial(initialJson);
    setBaseline(initialJson);
    setConfig(initial);
  }

  const setMode = useCallback(
    (mode: BoardMode) => {
      if (!sharesMode) {
        // A saved view shows what it was saved with.
        setConfig((current) => ({ ...current, mode }));
        return;
      }
      savePref(MODE_KEY, mode);
      setBoard((current) => switchMode(current, mode));
    },
    [sharesMode, setConfig],
  );
  // A grouping picked by hand stays, whatever the layout.
  const setGroupBy = useCallback(
    (groupBy: GroupBy) =>
      setBoard((current) => ({
        config: { ...current.config, groupBy },
        autoGrouped: false,
      })),
    [],
  );
  const setSortBy = useCallback(
    (sortBy: SortBy) => setConfig((current) => ({ ...current, sortBy })),
    [setConfig],
  );
  const addFilter = useCallback(
    (filter: BoardFilter) =>
      setConfig((current) => ({
        ...current,
        filters: [
          ...current.filters.filter(
            (existing) =>
              !(
                existing.field === filter.field &&
                existing.value === filter.value
              ),
          ),
          filter,
        ],
      })),
    [setConfig],
  );
  const removeFilter = useCallback(
    (filter: BoardFilter) =>
      setConfig((current) => ({
        ...current,
        filters: current.filters.filter(
          (existing) =>
            !(
              existing.field === filter.field && existing.value === filter.value
            ),
        ),
      })),
    [setConfig],
  );

  const markSaved = useCallback(
    () => setBaseline(normalize(config)),
    [config],
  );

  const openCreate = useCallback((defaults: TaskDefaults = {}) => {
    setDialogTask(null);
    setDialogDefaults(defaults);
    setDialogOpen(true);
  }, []);
  const openEdit = useCallback((task: TaskWithMeta) => {
    setDialogTask(task);
    setDialogOpen(true);
  }, []);

  const value = useMemo<BoardContextValue>(
    () => ({
      config,
      setMode,
      setGroupBy,
      setSortBy,
      addFilter,
      removeFilter,
      options,
      currentUserId,
      scopedProjectId,
      viewId,
      dirty: normalize(config) !== baseline,
      markSaved,
      visibleCount,
      setVisibleCount,
      showDone,
      setShowDone,
      dialogTask,
      dialogDefaults,
      dialogOpen,
      openCreate,
      openEdit,
      setDialogOpen,
    }),
    [
      config,
      setMode,
      setGroupBy,
      setSortBy,
      addFilter,
      removeFilter,
      options,
      currentUserId,
      scopedProjectId,
      viewId,
      baseline,
      markSaved,
      visibleCount,
      showDone,
      dialogTask,
      dialogDefaults,
      dialogOpen,
      openCreate,
      openEdit,
    ],
  );

  return (
    <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
  );
}
