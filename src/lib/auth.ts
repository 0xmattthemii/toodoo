import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import * as schema from "@/db/schema";
import {
  allowedEmailDomains,
  googleAuthEnabled,
  isEmailDomainAllowed,
} from "@/lib/auth-flags";
import { sendEmail } from "@/lib/email";
import { formatEmailDomains } from "@/lib/utils";

export const appBaseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

const baseURL = appBaseURL;

export const auth = betterAuth({
  baseURL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // OAuth callback failures that happen before the state is parsed (an
  // expired or already-used state, i.e. a stale/duplicate callback) have no
  // errorCallbackURL to return to. Send them to the login page, where
  // useOAuthErrorToast explains and offers a retry, instead of Better Auth's
  // bare /api/auth/error page.
  onAPIError: {
    errorURL: `${baseURL}/login`,
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your toodoo password",
        heading: "Reset your password",
        body: `Hi ${user.name}, click the button below to choose a new password. This link expires in one hour.`,
        actionLabel: "Reset password",
        actionUrl: url,
      });
    },
  },
  // Password sign-ups get one verification email. Verification is never
  // required to use the app; its only effect is convenience: a Google sign-in
  // with the same address links straight into a *verified* password account,
  // while an unverified one is asked for its password first (see
  // account.accountLinking below). Skipped when no mailer is configured.
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your toodoo email",
        heading: "Verify your email",
        body: `Hi ${user.name}, confirm this address so signing in with Google connects to this account automatically. This link expires in one hour.`,
        actionLabel: "Verify email",
        actionUrl: url,
      });
    },
  },
  socialProviders: googleAuthEnabled()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
          // Google Workspace hosted-domain lock. Better Auth sends it as the
          // `hd` hint and enforces it against the verified id-token claim.
          hd: process.env.GOOGLE_HOSTED_DOMAIN || undefined,
        },
      }
    : undefined,
  account: {
    // Same-email merging between Google and password accounts.
    //
    // Implicit linking (Google sign-in lands on an existing password
    // account) happens automatically when the local email is verified.
    // Better Auth refuses it for unverified local accounts, and rightly so:
    // otherwise anyone could pre-register a victim's address with a password
    // and capture the victim's Google identity on their first sign-in. That
    // case is handled by the login page instead — the Google callback returns
    // `account_not_linked`, the user signs in with their password once, and
    // the page calls linkSocial to attach Google (proving both identities).
    // Do NOT "fix" a stuck link by setting requireLocalEmailVerified: false
    // (deprecated, becomes unconditional) or trusting google.
    accountLinking: {
      enabled: true,
    },
  },
  databaseHooks: {
    account: {
      create: {
        after: async (account) => {
          // Explicit linking (linkSocial) leaves emailVerified untouched, but
          // Better Auth only lets Google link when it asserts email_verified
          // for the same address — and the user just proved the password too.
          // Mark the address verified so later Google sign-ins take the
          // automatic path. Sign-up and implicit linking already do this.
          if (account.providerId !== "google") return;
          try {
            await db
              .update(schema.user)
              .set({ emailVerified: true, updatedAt: new Date() })
              .where(
                and(
                  eq(schema.user.id, account.userId),
                  eq(schema.user.emailVerified, false),
                ),
              );
          } catch (error) {
            // The link itself succeeded; verification is a nicety.
            console.error("[auth] could not mark email verified after linking Google", error);
          }
        },
      },
    },
  },
  user: {
    // Domain lock. validateUserInfo runs on user creation (every method),
    // OAuth sign-in of existing users, and account linking — so an
    // out-of-domain Google identity can neither register, sign in, nor be
    // linked. Plain email/password sign-in is never re-validated, so
    // pre-existing password accounts keep working if the lock is added later.
    // Must RETURN the error (a throw is flattened to a generic
    // "validation_failed" and the message is lost).
    validateUserInfo: async ({ user }) => {
      if (allowedEmailDomains().length === 0) return;
      // Some linking paths can omit the email; fail closed — without an
      // address we cannot prove the identity is in-domain.
      if (!user.email || !isEmailDomainAllowed(user.email)) {
        return {
          error: "signup_domain_restricted",
          errorDescription: `Accounts on this toodoo instance are limited to ${formatEmailDomains(allowedEmailDomains())} email addresses`,
        };
      }
    },
  },
  plugins: [
    jwt(),
    // OAuth 2.1 authorization server + protected-resource metadata for the
    // MCP endpoint. AI agents register via RFC 7591 dynamic registration,
    // send users through /login + /consent, and call /api/mcp with the
    // issued bearer token.
    mcp({
      loginPage: "/login",
      consentPage: "/consent",
      resource: `${baseURL}/api/mcp`,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
