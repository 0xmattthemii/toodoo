import "server-only";

/**
 * Deployment-level auth switches, kept free of any database import so auth
 * pages can read them without pulling the Better Auth instance (and a DB
 * connection) into their module graph. Exposed as functions so the env vars
 * are read when called (after `await connection()` in pages), not captured
 * once at module evaluation.
 */

// Google sign-in is optional: self-hosted deployments without Google
// credentials get email & password only, no code changes required.
export function googleAuthEnabled() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

/**
 * Optional sign-up lock for self-hosted instances: a comma-separated list of
 * email domains (AUTH_ALLOWED_EMAIL_DOMAINS="acme.com,acme.dev"). When set,
 * account creation — email/password and Google alike — is limited to those
 * domains. Existing accounts are unaffected.
 */
export function allowedEmailDomains() {
  return (process.env.AUTH_ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/** True when the given email's domain passes the allowlist (or no lock is set). */
export function isEmailDomainAllowed(email: string) {
  const domains = allowedEmailDomains();
  if (domains.length === 0) return true;
  const domain = email.split("@").at(-1)?.toLowerCase();
  return Boolean(domain && domains.includes(domain));
}
