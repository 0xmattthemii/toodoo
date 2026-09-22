import "server-only";

/**
 * Local-only sign-in shortcut: one click instead of typing a password into
 * every worktree's dev server. It is not a bypass of the auth system — it
 * signs in through the same Better Auth email/password call the form uses, so
 * the session, cookie and middleware behave exactly as they do in production.
 *
 * Three independent conditions must all hold, so no single mistake (a stray
 * env var, a bad deploy target) can switch it on where it shouldn't be:
 *
 *   1. the build is not a production build,
 *   2. DEV_LOGIN=1 is set explicitly — never a default,
 *   3. the database is on this machine.
 *
 * (3) is the backstop: even a production build that somehow kept DEV_LOGIN
 * would refuse, because a deployment's database is never on localhost.
 *
 * What (3) cannot see is a tunnel: a forwarded port to a remote database is
 * still `localhost` from here. Turn DEV_LOGIN off before pointing a dev server
 * at anything but the database on this machine, or the button will happily
 * create its account there.
 */
export function devLoginEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_LOGIN === "1" &&
    databaseIsLocal()
  );
}

function databaseIsLocal() {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    // URL doesn't parse postgres:// hosts the way it parses http://.
    const { hostname } = new URL(url.replace(/^[^:]+:/, "http:"));
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

/**
 * The account the shortcut signs in as. Defaults to Resend's test address, so
 * the verification email that goes out when the account is first created lands
 * in their sink instead of bouncing off a made-up domain. Override both when a
 * domain lock (AUTH_ALLOWED_EMAIL_DOMAINS) is in force locally.
 */
export function devLoginAccount() {
  return {
    email: process.env.DEV_LOGIN_EMAIL || "delivered@resend.dev",
    password: process.env.DEV_LOGIN_PASSWORD || "dev-login-password",
    name: process.env.DEV_LOGIN_NAME || "Dev User",
  };
}
