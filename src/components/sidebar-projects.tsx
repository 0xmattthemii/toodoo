import { SidebarProjectLink } from "@/components/sidebar-project-link";
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

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {projects.map((project) => (
        <SidebarProjectLink key={project.id} project={project} />
      ))}
    </div>
  );
}
