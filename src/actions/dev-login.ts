"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { devLoginAccount, devLoginEnabled } from "@/lib/dev-login";

/**
 * Signs in as the local dev account (see src/lib/dev-login.ts for the three
 * conditions that have to hold). The guard is re-checked here rather than
 * trusted from the page: a server action is a public endpoint, so the button
 * being absent is a UI detail, not a defence.
 */
export async function devSignIn(): Promise<{ error?: string }> {
  if (!devLoginEnabled()) return { error: "Dev sign-in is not enabled" };

  const { email, password, name } = devLoginAccount();
  const requestHeaders = await headers();

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: requestHeaders });
    return {};
  } catch {
    // No such account yet — first run against this database. Creating it is
    // the same sign-up the form does, and it signs in on the way out.
  }

  try {
    await auth.api.signUpEmail({
      body: { email, password, name },
      headers: requestHeaders,
    });
    return {};
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return {
      error: `Could not sign in as ${email}: ${reason}. If the account exists with another password, set DEV_LOGIN_PASSWORD to match it.`,
    };
  }
}
