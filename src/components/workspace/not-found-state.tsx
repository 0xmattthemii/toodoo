import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export function WorkspaceNotFound({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Back to all tasks
      </Link>
    </div>
  );
}
