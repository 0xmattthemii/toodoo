"use client";

import { ErrorState } from "@/components/error-state";

/**
 * Catches anything below the root layout — including the app shell's layout,
 * where the session lookup runs — so a dropped database connection ends in a
 * "Try again" instead of Next.js's built-in full-document error page.
 */
export default function RootError({ retry }: { retry: () => void }) {
  return <ErrorState retry={retry} className="min-h-dvh" />;
}
