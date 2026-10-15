import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { requireWorkspaceRole } from "@/lib/workspace-access";

// Deduped per request: layout, pages, and streamed content share one lookup.
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * The signed-in user, who must also belong to the workspace. Someone signed
 * in without an active membership — removed, or invited and not verified yet
 * — is sent to the app's root, which tells them why it shows them nothing.
 */
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  try {
    await requireWorkspaceRole(session.user.id);
  } catch {
    redirect("/");
  }
  return session;
}
