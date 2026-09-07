"use client";

import { ErrorState } from "@/components/error-state";

/**
 * Catches a page inside the app shell failing to render; the sidebar stays
 * up. The shell's own layout (where the session lookup runs) sits above this
 * boundary and falls through to the root one.
 */
export default function AppPageError({ retry }: { retry: () => void }) {
  return <ErrorState retry={retry} className="h-full" />;
}
