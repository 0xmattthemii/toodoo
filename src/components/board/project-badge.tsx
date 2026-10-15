import { Badge } from "@/components/ui/badge";
import { tintStyle } from "@/lib/appearance";
import { cn } from "@/lib/utils";

/** A task's project, washed in the project's color when it has one. */
export function ProjectBadge({
  name,
  color,
  className,
}: {
  name: string;
  color: string | null;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(color && "border-transparent bg-background", className)}
      style={color ? tintStyle(color) : undefined}
    >
      <span className="truncate">{name}</span>
    </Badge>
  );
}
