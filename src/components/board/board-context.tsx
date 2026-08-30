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
  addFilter: (filter: BoardFilter) => void;
  removeFilter: (filter: BoardFilter) => void;

  /** Dropdown options, registered by the board content once its data arrives. */
  options: BoardOptions;
  registerOptions: (options: BoardOptions) => void;

  currentUserId: string;
  scopedProjectId?: string;

  /** Saved-view context: set on /views/[id] pages. */
  viewId?: string;
  dirty: boolean;
  markSaved: () => void;

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
}: {
  children: React.ReactNode;
  currentUserId: string;
  scopedProjectId?: string;
  viewId?: string;
  initialConfig?: BoardConfig;
}) {
  const initial = initialConfig ?? DEFAULT_BOARD_CONFIG;
  const [config, setConfig] = useState<BoardConfig>(initial);
  const [baseline, setBaseline] = useState(() => normalize(initial));
  const [options, setOptions] = useState<BoardOptions>({
    projects: [],
    people: [],
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTask, setDialogTask] = useState<TaskWithMeta | null>(null);

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

  const registerOptions = useCallback((next: BoardOptions) => {
    setOptions(next);
  }, []);

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
      addFilter,
      removeFilter,
      options,
      registerOptions,
      currentUserId,
      scopedProjectId,
      viewId,
      dirty: normalize(config) !== baseline,
      markSaved,
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
      addFilter,
      removeFilter,
      options,
      registerOptions,
      currentUserId,
      scopedProjectId,
      viewId,
      baseline,
      markSaved,
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
