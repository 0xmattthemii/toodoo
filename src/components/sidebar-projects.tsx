"use client";

import { SidebarProjectList } from "@/components/sidebar-project-list";
import { useWorkspace } from "@/components/workspace/workspace-provider";

export function SidebarProjects() {
  const { projects } = useWorkspace();

  if (projects.length === 0) {
    return (
      <p className="px-4 py-1 text-sm text-muted-foreground">
        No projects yet
      </p>
    );
  }

  return <SidebarProjectList projects={projects} />;
}
