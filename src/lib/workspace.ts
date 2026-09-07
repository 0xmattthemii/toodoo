import type {
  MemberWithUser,
  PendingInvitation,
  Person,
  ProjectSummary,
  Role,
  TaskWithMeta,
  ViewSummary,
} from "@/lib/types";

/** One user's membership in one project, with the member's profile. */
export type ProjectMembership = {
  projectId: string;
  role: Role;
  user: Person;
};

export type ProjectInvitation = PendingInvitation & { projectId: string };

/**
 * Everything the signed-in user can see, loaded once by the app shell and
 * kept on the client. Boards, dialogs and the sidebar all read from it, so
 * moving between pages never waits on the server, and a mutation shows up the
 * instant it is made (see components/workspace/workspace-provider.tsx).
 */
export type WorkspaceSnapshot = {
  /** Server clock when the snapshot was read; an older snapshot never replaces a newer one. */
  at: number;
  me: Person;
  projects: ProjectSummary[];
  views: ViewSummary[];
  /** Tasks in the user's projects, created by them, or assigned to them. */
  tasks: TaskWithMeta[];
  /** Members of every project the user is in (includes the user). */
  memberships: ProjectMembership[];
  /** Pending invitations of the projects the user administers. */
  invitations: ProjectInvitation[];
};

/** A pure change to a snapshot; the same function is used for the optimistic view and the committed one. */
export type Mutation = (snapshot: WorkspaceSnapshot) => WorkspaceSnapshot;

export function compose(...mutations: Mutation[]): Mutation {
  return (snapshot) =>
    mutations.reduce((current, mutation) => mutation(current), snapshot);
}

// ---- tasks ----

export function addTask(task: TaskWithMeta): Mutation {
  return (s) => ({
    ...s,
    tasks: s.tasks.some((t) => t.id === task.id)
      ? s.tasks.map((t) => (t.id === task.id ? task : t))
      : [task, ...s.tasks],
  });
}

export function patchTask(
  taskId: string,
  patch: Partial<Omit<TaskWithMeta, "id">>,
): Mutation {
  return (s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
  });
}

export function removeTask(taskId: string): Mutation {
  return (s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== taskId) });
}

// ---- projects ----

/** Adds a project the user just created, as its admin. */
export function addProject(project: ProjectSummary, me: Person): Mutation {
  return (s) => ({
    ...s,
    projects: s.projects.some((p) => p.id === project.id)
      ? s.projects
      : [...s.projects, project],
    memberships: s.memberships.some(
      (m) => m.projectId === project.id && m.user.id === me.id,
    )
      ? s.memberships
      : [...s.memberships, { projectId: project.id, role: "admin", user: me }],
  });
}

export function patchProject(
  projectId: string,
  patch: Partial<Omit<ProjectSummary, "id" | "role">>,
): Mutation {
  return (s) => ({
    ...s,
    projects: s.projects.map((p) =>
      p.id === projectId ? { ...p, ...patch } : p,
    ),
  });
}

/** Drops a project and everything hanging off it, as leaving or deleting it does. */
export function removeProject(projectId: string): Mutation {
  return (s) => ({
    ...s,
    projects: s.projects.filter((p) => p.id !== projectId),
    tasks: s.tasks.filter((t) => t.projectId !== projectId),
    memberships: s.memberships.filter((m) => m.projectId !== projectId),
    invitations: s.invitations.filter((i) => i.projectId !== projectId),
  });
}

// ---- views ----

export function addView(view: ViewSummary): Mutation {
  return (s) => ({
    ...s,
    views: s.views.some((v) => v.id === view.id) ? s.views : [...s.views, view],
  });
}

export function patchView(
  viewId: string,
  patch: Partial<Omit<ViewSummary, "id">>,
): Mutation {
  return (s) => ({
    ...s,
    views: s.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)),
  });
}

export function removeView(viewId: string): Mutation {
  return (s) => ({ ...s, views: s.views.filter((v) => v.id !== viewId) });
}

// ---- members & invitations ----

export function addMember(projectId: string, member: MemberWithUser): Mutation {
  const { role, ...user } = member;
  return (s) => ({
    ...s,
    memberships: s.memberships.some(
      (m) => m.projectId === projectId && m.user.id === user.id,
    )
      ? s.memberships
      : [...s.memberships, { projectId, role, user }],
  });
}

export function setMemberRole(
  projectId: string,
  userId: string,
  role: Role,
): Mutation {
  return (s) => ({
    ...s,
    memberships: s.memberships.map((m) =>
      m.projectId === projectId && m.user.id === userId ? { ...m, role } : m,
    ),
    projects:
      userId === s.me.id
        ? s.projects.map((p) => (p.id === projectId ? { ...p, role } : p))
        : s.projects,
  });
}

/** Removing yourself is leaving: the project disappears altogether. */
export function removeMember(projectId: string, userId: string): Mutation {
  return (s) =>
    userId === s.me.id
      ? removeProject(projectId)(s)
      : {
          ...s,
          memberships: s.memberships.filter(
            (m) => !(m.projectId === projectId && m.user.id === userId),
          ),
          // An assignee who left keeps their spot on the task; the server's
          // next snapshot decides.
        };
}

export function addInvitation(invitation: ProjectInvitation): Mutation {
  return (s) => ({
    ...s,
    invitations: s.invitations.some((i) => i.id === invitation.id)
      ? s.invitations
      : [...s.invitations, invitation],
  });
}

export function removeInvitation(invitationId: string): Mutation {
  return (s) => ({
    ...s,
    invitations: s.invitations.filter((i) => i.id !== invitationId),
  });
}
