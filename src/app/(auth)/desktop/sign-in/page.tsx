import { cookies } from "next/headers";
import { connection } from "next/server";

import { googleAuthEnabled } from "@/lib/auth-flags";
import { CHALLENGE_COOKIE } from "@/lib/desktop-auth";

import { DesktopSignIn } from "./desktop-sign-in";

/**
 * The browser half of signing in to the desktop app. Reached only from
 * `/api/desktop/auth/start`, which the app opens in the user's own browser;
 * nothing here is useful without the challenge cookie that route sets.
 */
export default async function DesktopSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Request-time, like /login: self-hosted builds read auth env vars set
  // after the image was built.
  await connection();
  const { handoff, error } = await searchParams;
  return (
    <DesktopSignIn
      handoff={typeof handoff === "string" ? handoff : null}
      error={typeof error === "string" ? error : null}
      started={Boolean((await cookies()).get(CHALLENGE_COOKIE)?.value)}
      googleEnabled={googleAuthEnabled()}
    />
  );
}
