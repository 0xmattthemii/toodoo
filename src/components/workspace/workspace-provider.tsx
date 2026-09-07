"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { tryAction } from "@/lib/action";
import type {
  MemberWithUser,
  Person,
  ProjectSummary,
  TaskWithMeta,
  ViewSummary,
} from "@/lib/types";
import type {
  Mutation,
  ProjectInvitation,
  WorkspaceSnapshot,
} from "@/lib/workspace";

/** Results follow the actions' convention: `{ error }` when rejected. */
type ActionResult = { error?: string };

export type MutationSpec<R extends ActionResult> = {
  /** Applied to what is on screen right away; dropped if the action fails. */
  optimistic?: Mutation;
  /** The server call. */
  action: () => Promise<R>;
  /** Toast shown when the round trip fails outright (the action's own `error` wins). */
  failure: string;
  /**
   * What to fold into the confirmed state once the action succeeds. Defaults
   * to `optimistic`; use it when the outcome is only known from the result.
   */
  commit?: (result: R) => Mutation | null;
  /** Offer a "Retry" on the failure toast that runs the same spec again. */
  retry?: boolean;
};

type WorkspaceValue = {
  me: Person;
  projects: ProjectSummary[];
  views: ViewSummary[];
  /** Tasks with `projectName` resolved from the current projects. */
  tasks: TaskWithMeta[];
  /** Everyone the user shares a project with, plus the user. Sorted by name. */
  people: Person[];
  projectsById: Map<string, ProjectSummary>;
  viewsById: Map<string, ViewSummary>;
  membersOf: (projectId: string) => MemberWithUser[];
  invitationsOf: (projectId: string) => ProjectInvitation[];
  /**
   * Run a mutation: the optimistic change shows immediately, the action runs
   * in the background, and the result is folded into the confirmed state (or
   * reverted, with a toast). Resolves to the result, or null on failure.
   */
  mutate: <R extends ActionResult>(spec: MutationSpec<R>) => Promise<R | null>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  }
  return value;
}

type PendingEntry = { apply: Mutation };
type CommittedEntry = { apply: Mutation; until: number };

/** How long a snapshot is trusted before regaining focus triggers a refresh. */
const REFRESH_AFTER_MS = 30_000;
/** Background poll while the tab stays visible, to pick up teammates' changes. */
const POLL_EVERY_MS = 60_000;
/**
 * How long a confirmed mutation keeps being re-applied over incoming
 * snapshots. Responses can cross on the wire: a snapshot rendered for an
 * earlier action may land after a later action has already been confirmed,
 * and its `at` only says when it was read, not what it knows about. Within
 * this window the later change is held onto; the mutations are idempotent, so
 * re-applying one a snapshot already reflects changes nothing.
 */
const COMMIT_GRACE_MS = 15_000;

/**
 * Holds the workspace on the client.
 *
 * `baseline` is what the server confirmed: the snapshot the layout rendered
 * with, plus every mutation that has since succeeded. `pending` holds the
 * mutations still in flight. What components see is `pending` applied on top
 * of `baseline`, so a change is visible the instant it is made and stays
 * visible through the server's answer — when an action succeeds, it moves
 * from `pending` into `baseline` in one step, and when the layout re-renders
 * with a fresh snapshot (after `revalidatePath`, a refresh, or a poll), that
 * snapshot becomes the new baseline with the in-flight changes — and those
 * confirmed in the last few seconds, see COMMIT_GRACE_MS — re-applied.
 */
export function WorkspaceProvider({
  snapshot,
  children,
}: {
  snapshot: WorkspaceSnapshot;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(snapshot);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [committed, setCommitted] = useState<CommittedEntry[]>([]);

  // Adopt each snapshot the server sends, unless it predates one already
  // adopted (two responses can cross on the wire).
  const [seen, setSeen] = useState(snapshot);
  if (snapshot !== seen) {
    setSeen(snapshot);
    if (snapshot.at >= baseline.at) setBaseline(snapshot);
    const now = Date.now();
    setCommitted((current) => current.filter((entry) => entry.until > now));
  }

  const lastSync = useRef(Date.now());
  useEffect(() => {
    lastSync.current = Date.now();
  }, [snapshot]);

  // Other people's changes arrive with the next snapshot: refresh when the
  // tab comes back after a while, and poll gently while it stays open.
  useEffect(() => {
    function refreshIfStale(minAge: number) {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastSync.current < minAge) return;
      lastSync.current = Date.now();
      router.refresh();
    }
    const onFocus = () => refreshIfStale(REFRESH_AFTER_MS);
    const interval = setInterval(() => refreshIfStale(POLL_EVERY_MS), POLL_EVERY_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [router]);

  const mutate = useCallback(async function run<R extends ActionResult>(
    spec: MutationSpec<R>,
  ): Promise<R | null> {
    const entry: PendingEntry = { apply: spec.optimistic ?? ((s) => s) };
    // Urgent, so the change paints on the very next frame.
    if (spec.optimistic) setPending((current) => [...current, entry]);

    return new Promise<R | null>((resolve) => {
      // A transition, so a redirect thrown by the action (an expired
      // session) is handled by the router the way it is for any action.
      startTransition(async () => {
        const result = await tryAction(spec.action(), {
          error: spec.failure,
        } as R);
        if (result.error) {
          setPending((current) => current.filter((e) => e !== entry));
          toast.error(result.error, {
            action: spec.retry
              ? { label: "Retry", onClick: () => void run(spec) }
              : undefined,
          });
          resolve(null);
          return;
        }
        const commit = spec.commit ? spec.commit(result) : spec.optimistic;
        // Same batch: the change leaves `pending` as it enters `baseline`.
        if (commit) {
          setBaseline((current) => commit(current));
          const now = Date.now();
          setCommitted((current) => [
            ...current.filter((e) => e.until > now),
            { apply: commit, until: now + COMMIT_GRACE_MS },
          ]);
        }
        setPending((current) => current.filter((e) => e !== entry));
        resolve(result);
      });
    });
  }, []);

  const current = useMemo(
    () =>
      [...committed, ...pending].reduce(
        (s, entry) => entry.apply(s),
        baseline,
      ),
    [baseline, committed, pending],
  );

  const value = useMemo<WorkspaceValue>(() => {
    const projectsById = new Map(current.projects.map((p) => [p.id, p]));
    const viewsById = new Map(current.views.map((v) => [v.id, v]));

    const peopleById = new Map<string, Person>([[current.me.id, current.me]]);
    const membersByProject = new Map<string, MemberWithUser[]>();
    for (const { projectId, role, user } of current.memberships) {
      peopleById.set(user.id, user);
      const list = membersByProject.get(projectId) ?? [];
      list.push({ ...user, role });
      membersByProject.set(projectId, list);
    }
    const people = [...peopleById.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const invitationsByProject = new Map<string, ProjectInvitation[]>();
    for (const invitation of current.invitations) {
      const list = invitationsByProject.get(invitation.projectId) ?? [];
      list.push(invitation);
      invitationsByProject.set(invitation.projectId, list);
    }

    const tasks = current.tasks.map((task) => {
      const projectName = task.projectId
        ? (projectsById.get(task.projectId)?.name ?? task.projectName)
        : null;
      return projectName === task.projectName ? task : { ...task, projectName };
    });

    return {
      me: current.me,
      projects: current.projects,
      views: current.views,
      tasks,
      people,
      projectsById,
      viewsById,
      membersOf: (projectId) => membersByProject.get(projectId) ?? [],
      invitationsOf: (projectId) => invitationsByProject.get(projectId) ?? [],
      mutate,
    };
  }, [current, mutate]);

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}
