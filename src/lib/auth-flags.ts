import "server-only";

/**
 * Deployment-level auth switches, kept free of any database import so auth
 * pages can read them without pulling the Better Auth instance (and a DB
 * connection) into their module graph.
 */

// Google sign-in is optional: self-hosted deployments without Google
// credentials get email & password only, no code changes required.
export const googleAuthEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

/**
 * Optional sign-up lock for self-hosted instances: a comma-separated list of
 * email domains (AUTH_ALLOWED_EMAIL_DOMAINS="acme.com,acme.dev"). When set,
 * account creation — email/password and Google alike — is limited to those
 * domains. Existing accounts are unaffected.
 */
export const allowedEmailDomains = (
  process.env.AUTH_ALLOWED_EMAIL_DOMAINS ?? ""
)
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);
