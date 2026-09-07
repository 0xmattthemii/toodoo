"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import {
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

  /** Completed tasks are hidden by default. */
  showDone: boolean;
  setShowDone: (show: boolean) => void;

  dialogTask: TaskWithMeta | null;
  dialogOpen: boolean;
  openCreate: () => void;
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
  const [config, setConfig] = useState<BoardConfig>(initial);
  const [baseline, setBaseline] = useState(() => normalize(initial));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTask, setDialogTask] = useState<TaskWithMeta | null>(null);
  const [showDone, setShowDone] = useState(false);

  // If the saved view is updated server-side, re-seed the local state.
  const [prevInitial, setPrevInitial] = useState(() => normalize(initial));
  const initialJson = normalize(initial);
  if (initialJson !== prevInitial) {
    setPrevInitial(initialJson);
    setBaseline(initialJson);
    setConfig(initial);
  }

  const setMode = useCallback(
    (mode: BoardMode) => setConfig((current) => ({ ...current, mode })),
    [],
  );
  const setGroupBy = useCallback(
    (groupBy: GroupBy) => setConfig((current) => ({ ...current, groupBy })),
    [],
  );
  const setSortBy = useCallback(
    (sortBy: SortBy) => setConfig((current) => ({ ...current, sortBy })),
    [],
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
    [],
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
    [],
  );

  const markSaved = useCallback(
    () => setBaseline(normalize(config)),
    [config],
  );

  const openCreate = useCallback(() => {
    setDialogTask(null);
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
      showDone,
      setShowDone,
      dialogTask,
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
      showDone,
      dialogTask,
      dialogOpen,
      openCreate,
      openEdit,
    ],
  );

  return (
    <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
  );
}
