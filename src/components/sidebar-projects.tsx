import { SidebarProjectList } from "@/components/sidebar-project-list";
import { getUserProjects } from "@/lib/data";

export async function SidebarProjects({ userId }: { userId: string }) {
  const projects = await getUserProjects(userId);

  if (projects.length === 0) {
    return (
      <p className="px-4 py-1 text-sm text-muted-foreground">
        No projects yet
      </p>
    );
  }

  return <SidebarProjectList projects={projects} />;
}
