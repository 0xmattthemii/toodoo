import { NextResponse, type NextRequest } from "next/server";

import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_SECONDS,
  isValidChallenge,
} from "@/lib/desktop-auth";

/**
 * Where the desktop app sends the user's browser to start a sign-in. Stores
 * the shell's challenge in an httpOnly cookie — so only a browser that came
 * through here can complete a handoff, and the challenge never has to ride
 * along through Google's redirect — then hands over to the sign-in page.
 */
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get("challenge");
  const destination = new URL("/desktop/sign-in", request.nextUrl.origin);
  if (!isValidChallenge(challenge)) {
    destination.searchParams.set("error", "invalid_request");
    return NextResponse.redirect(destination);
  }
  const response = NextResponse.redirect(destination);
  response.cookies.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "lax",
    // The shell only connects to https deployments (localhost excepted), so
    // this is secure everywhere but development.
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
  });
  return response;
}
