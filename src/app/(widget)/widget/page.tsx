import type { Metadata } from "next";

import { TasksWidget } from "@/components/widget/tasks-widget";
import { WidgetNotice } from "@/components/widget/widget-notice";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { getWorkspaceSnapshot } from "@/lib/data";
import { getSession } from "@/lib/session";
import type { Person } from "@/lib/types";
import { getWorkspaceMember } from "@/lib/workspace-access";

export const metadata: Metadata = { title: "Tasks · toodoo" };

/**
 * The tasks widget: a simplified list for a small window that stays on screen
 * — the desktop app's floating window, or a browser popup (see
 * `openTasksWidget`). It sits outside the app shell, with no sidebar, on the
 * same workspace snapshot the shell loads, so it works the same way: changes
 * show at once and are kept in step by the provider.
 *
 * Nothing here redirects. The window is too small for the login page or for
 * the screens that explain a missing membership, so it says what is wrong and
 * leaves the fixing to the app.
 */
export default async function WidgetPage() {
  const session = await getSession();
  if (!session) return <WidgetNotice reason="signed-out" />;
  const me: Person = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };
  const membership = await getWorkspaceMember(me.id);
  if (!membership || membership.deactivatedAt) {
    return <WidgetNotice reason="no-access" />;
  }
  const snapshot = await getWorkspaceSnapshot(me, membership.role);

  return (
    <WorkspaceProvider snapshot={snapshot}>
      <TasksWidget />
    </WorkspaceProvider>
  );
}
