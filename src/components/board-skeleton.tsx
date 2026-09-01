import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder for the task area only — the toolbar and page chrome are
 * static and always render immediately.
 */
export function BoardContentSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 pt-4 pb-6" aria-hidden>
      {[0, 1].map((section) => (
        <div key={section}>
          <div className="mb-2 flex items-center gap-2">
            <Skeleton className="h-4 w-20 rounded" />
          </div>
          <div className="overflow-hidden rounded-xl border">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className={`flex items-center gap-3 px-3 py-2.5 ${row > 0 ? "border-t" : ""}`}
              >
                <Skeleton className="size-4 rounded-md" />
                <Skeleton className="h-4 w-56 rounded" />
                <span className="ml-auto flex items-center gap-2">
                  <Skeleton className="h-4 w-14 rounded" />
                  <Skeleton className="size-5 rounded-full" />
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProjectHeaderSkeleton() {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-6" aria-hidden>
      <Skeleton className="size-5 rounded" />
      <Skeleton className="h-5 w-40 rounded" />
      <span className="ml-auto flex items-center gap-2">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="size-8 rounded-lg" />
      </span>
    </div>
  );
}
