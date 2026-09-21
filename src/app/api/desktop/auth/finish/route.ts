import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

/**
 * Redeeming a token establishes a session, and this has to be a plain GET so
 * that the shell can *navigate* to it — that navigation is what puts the
 * cookie in the webview. So refuse the request when a page sent the browser
 * here: otherwise any website could link a visitor to a token minted for the
 * attacker's own account and silently sign them into it (login CSRF).
 *
 * `Sec-Fetch-Site` tells the two apart. A browser sends `cross-site` or
 * `same-site` only when another site initiated the navigation, which the
 * shell never does — it loads the URL directly, with no initiating page.
 * Anything else, including the header being absent on an older webview, is
 * allowed: an attack needs a real browser, and every browser that ships
 * Sec-Fetch headers sends them on navigations, so failing open here costs
 * nothing while a stricter rule risks breaking sign-in on some webview.
 */
function initiatedByAnotherSite(request: NextRequest) {
  const site = request.headers.get("sec-fetch-site");
  return site === "cross-site" || site === "same-site";
}

/**
 * Last hop of a desktop sign-in: the shell navigates its webview here with
 * the one-time token it claimed, and redeeming the token sets the session
 * cookie *in the webview's* cookie jar. The token is single-use and expires
 * in minutes, so it is spent by the time this URL reaches the window's
 * history. Failures land on the login page, which explains them.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const failed = NextResponse.redirect(
    new URL("/login?error=desktop_handoff_failed", request.nextUrl.origin),
  );
  if (!token || initiatedByAnotherSite(request)) return failed;

  try {
    // asResponse so the Set-Cookie headers are ours to place on the redirect
    // rather than depending on the nextCookies plugin reaching Next's cookie
    // store from a route handler.
    const verified = await auth.api.verifyOneTimeToken({
      body: { token },
      asResponse: true,
    });
    if (!verified.ok) return failed;
    const response = NextResponse.redirect(new URL("/", request.nextUrl.origin));
    for (const cookie of verified.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  } catch (error) {
    console.error("[desktop] could not redeem a sign-in handoff", error);
    return failed;
  }
}
