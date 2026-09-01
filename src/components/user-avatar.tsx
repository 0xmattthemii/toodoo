import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserAvatar({
  person,
  className,
  textClassName = "text-[10px]",
}: {
  person: { name: string; image: string | null };
  className?: string;
  textClassName?: string;
}) {
  return (
    <Avatar className={cn("size-6", className)}>
      {person.image ? (
        <AvatarImage src={person.image} alt={person.name} />
      ) : null}
      <AvatarFallback className={textClassName}>
        {initials(person.name) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}
