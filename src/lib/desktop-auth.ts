import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";

import { db } from "@/db";
import { desktopSignIn } from "@/db/schema";

/**
 * Server half of the desktop app's browser sign-in.
 *
 * 1. The shell picks a random `verifier`, keeps it in memory, and opens the
 *    user's browser at `/api/desktop/auth/start?challenge=sha256(verifier)`.
 * 2. That route remembers the challenge in a short-lived httpOnly cookie and
 *    sends the browser through the ordinary Google sign-in.
 * 3. `/api/desktop/auth/complete` mints a one-time token for the session the
 *    browser just got and parks it here under a fresh handoff id, which it
 *    hands to the shell through `toodoo://sign-in/callback?id=…`.
 * 4. The shell posts the id *and the verifier* to `/api/desktop/auth/claim`,
 *    gets the token, and navigates its webview to `/api/desktop/auth/finish`,
 *    where redeeming the token sets the session cookie in the webview.
 *
 * The verifier never leaves the shell until step 4, so intercepting the deep
 * link in step 3 — the one hop that leaves the app, over an OS-wide scheme any
 * app may register — yields nothing redeemable. Same reasoning as PKCE, which
 * RFC 8252 requires of native apps for exactly this hop.
 *
 * One sign-in, one session: the token stands in for the session row the
 * browser got, so the app and that browser share it. Signing out in either
 * ends both, which is what a single sign-in should mean.
 */

/** Carries the challenge from step 2 to step 3 in the browser. */
export const CHALLENGE_COOKIE = "toodoo_desktop_sign_in";

/** How long the user has to get through Google before the flow expires. */
export const CHALLENGE_TTL_SECONDS = 10 * 60;

/**
 * How long a minted handoff stays claimable. The shell claims it within a
 * second of the deep link arriving; this only has to cover the app being slow
 * to wake up.
 */
const HANDOFF_TTL_SECONDS = 120;

/** Verifiers and challenges are 32 random bytes as lowercase hex. */
const HEX_32_BYTES = /^[0-9a-f]{64}$/;

export function isValidChallenge(value: unknown): value is string {
  return typeof value === "string" && HEX_32_BYTES.test(value);
}

export const isValidVerifier = isValidChallenge;

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Park a one-time token for the shell to claim. Returns the handoff id, which
 * travels through the deep link (and the browser's address bar) — on its own
 * it redeems nothing.
 */
export async function createHandoff(challenge: string, token: string) {
  // Nothing else prunes this table; an abandoned flow (the user closed the
  // browser tab) would otherwise leave its row behind forever.
  await db.delete(desktopSignIn).where(lt(desktopSignIn.expiresAt, new Date()));
  const id = randomUUID();
  await db.insert(desktopSignIn).values({
    id,
    challenge,
    token,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000),
  });
  return id;
}

/**
 * Exchange a handoff id plus the shell's verifier for the one-time token.
 * Returns null when the id is unknown, expired, or the verifier doesn't match
 * the challenge it was created with.
 */
export async function claimHandoff(id: string, verifier: string) {
  // Deleted as it is read, in one statement: single use whether or not the
  // verifier matches (a wrong guess burns the handoff rather than leaving it
  // up for another try), and two claims racing for the same id can't both
  // come away with the token.
  const [handoff] = await db
    .delete(desktopSignIn)
    .where(eq(desktopSignIn.id, id))
    .returning();
  if (!handoff) return null;
  if (handoff.expiresAt.getTime() <= Date.now()) return null;
  if (!hexEquals(handoff.challenge, sha256Hex(verifier))) return null;
  return handoff.token;
}

/** Constant-time compare of two same-length lowercase hex strings. */
function hexEquals(a: string, b: string) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
