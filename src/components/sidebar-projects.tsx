import { Hash } from "lucide-react";
import Link from "next/link";

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
        <Link
          key={project.id}
          href={`/projects/${project.id}`}
          className="flex h-8 items-center gap-2 rounded-lg px-2 text-sm text-foreground hover:bg-accent"
        >
          <Hash className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{project.name}</span>
        </Link>
      ))}
    </div>
  );
}
