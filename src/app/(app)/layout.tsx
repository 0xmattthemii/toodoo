import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProjects } from "@/components/sidebar-projects";
import { SidebarViews } from "@/components/sidebar-views";
import { TaskDndProvider } from "@/components/task-dnd";
import { Workspace } from "@/components/workspace/workspace";
import { WorkspaceErrorBoundary } from "@/components/workspace/workspace-error-boundary";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { WorkspaceSkeleton } from "@/components/workspace/workspace-skeleton";
import { googleAuthEnabled } from "@/lib/auth-flags";
import { acceptPendingInvitations, getWorkspaceSnapshot } from "@/lib/data";
import { requireSession } from "@/lib/session";
import type { Person } from "@/lib/types";

/**
 * The app shell loads the whole workspace once and keeps it on the client
 * (see components/workspace/workspace-provider.tsx). The boards are rendered
 * here from that data, keyed off the URL, so moving between pages never waits
 * on the server; the route files below only exist for their URLs.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const me: Person = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };
  const googleEnabled = googleAuthEnabled();

  return (
    // One drag context around sidebar and content, so a task card can be
    // dropped on a project in the sidebar.
    <TaskDndProvider>
      {/* The HTML shell streams before the database answers; the sidebar
          frame and a placeholder board show while the snapshot loads. */}
      <Suspense
        fallback={<WorkspaceSkeleton user={me} googleEnabled={googleEnabled} />}
      >
        <WorkspaceShell me={me} googleEnabled={googleEnabled}>
          {children}
        </WorkspaceShell>
      </Suspense>
    </TaskDndProvider>
  );
}

async function WorkspaceShell({
  me,
  googleEnabled,
  children,
}: {
  me: Person;
  googleEnabled: boolean;
  children: React.ReactNode;
}) {
  try {
    await acceptPendingInvitations(me.id, me.email);
  } catch {
    // Best effort — a failed invitation sync should never block the app.
  }
  const snapshot = await getWorkspaceSnapshot(me);

  return (
    <WorkspaceProvider snapshot={snapshot}>
      <div className="flex h-dvh w-full">
        <AppSidebar
          user={me}
          googleEnabled={googleEnabled}
          projects={<SidebarProjects />}
          views={<SidebarViews />}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <WorkspaceErrorBoundary>
            <Workspace />
          </WorkspaceErrorBoundary>
          {children}
        </main>
      </div>
    </WorkspaceProvider>
  );
}
