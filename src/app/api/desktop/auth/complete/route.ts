import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import {
  CHALLENGE_COOKIE,
  createHandoff,
  isValidChallenge,
} from "@/lib/desktop-auth";

/**
 * Where Google sign-in returns to in the browser half of a desktop sign-in.
 * The browser now holds a session; mint a one-time token for it and park it
 * under a handoff id, which the sign-in page passes to the app.
 */
export async function GET(request: NextRequest) {
  // The challenge is spent whatever happens: a failed attempt starts over
  // from the app rather than resuming with a cookie left lying around.
  const to = (query: string) => {
    const response = NextResponse.redirect(
      new URL(`/desktop/sign-in?${query}`, request.nextUrl.origin),
    );
    response.cookies.delete(CHALLENGE_COOKIE);
    return response;
  };

  const challenge = request.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!isValidChallenge(challenge)) return to("error=sign_in_expired");

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return to("error=no_session");

  try {
    // Server-side only: the one-time-token plugin refuses client requests, so
    // a page in this browser can't mint itself a transferable session.
    const { token } = await auth.api.generateOneTimeToken({
      headers: requestHeaders,
    });
    return to(`handoff=${await createHandoff(challenge, token)}`);
  } catch (error) {
    console.error("[desktop] could not mint a sign-in handoff", error);
    return to("error=handoff_failed");
  }
}
