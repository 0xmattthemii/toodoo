import { Skeleton } from "@/components/ui/skeleton";

/** The widget's frame while the workspace loads: header, a few rows, the add bar. */
export default function WidgetLoading() {
  return (
    <div className="flex h-dvh flex-col bg-background" aria-hidden>
      <div
        data-tauri-drag-region
        className="flex h-10 shrink-0 items-center border-b px-3.5 desktop-macos:pl-20"
      >
        <Skeleton className="h-3.5 w-20 rounded" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center gap-2.5">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-3.5 flex-1 rounded" />
          </div>
        ))}
      </div>
      <div className="h-10 shrink-0 border-t" />
    </div>
  );
}
