"use client";

import { useParams, usePathname } from "next/navigation";

import { AllTasksBoard } from "@/components/workspace/all-tasks-board";
import { ProjectBoard } from "@/components/workspace/project-board";
import { ViewBoard } from "@/components/workspace/view-board";

/**
 * The main area of the app shell. It is rendered by the layout — not by the
 * pages — and picks the board from the URL, so switching between "All tasks",
 * a project and a view is a pure client-side re-render of data that is
 * already here: no server round trip, no skeleton. The route files under
 * app/(app) exist for the URLs; they render nothing.
 */
export function Workspace() {
  const pathname = usePathname();
  const params = useParams<{ projectId?: string; viewId?: string }>();

  if (params.projectId) {
    return <ProjectBoard key={params.projectId} projectId={params.projectId} />;
  }
  if (params.viewId) {
    return <ViewBoard key={params.viewId} viewId={params.viewId} />;
  }
  if (pathname === "/") return <AllTasksBoard />;
  return null;
}
