import { Suspense } from "react";

import { AppSidebar, SidebarListSkeleton } from "@/components/app-sidebar";
import { SidebarProjects } from "@/components/sidebar-projects";
import { SidebarViews } from "@/components/sidebar-views";
import { acceptPendingInvitations } from "@/lib/data";
import { requireSession } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  try {
    await acceptPendingInvitations(session.user.id, session.user.email);
  } catch {
    // Best effort — a failed invitation sync should never block the app.
  }

  return (
    <div className="flex h-dvh w-full">
      <AppSidebar
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image ?? null,
        }}
        projects={
          <Suspense fallback={<SidebarListSkeleton />}>
            <SidebarProjects userId={session.user.id} />
          </Suspense>
        }
        views={
          <Suspense fallback={<SidebarListSkeleton />}>
            <SidebarViews userId={session.user.id} />
          </Suspense>
        }
      />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
