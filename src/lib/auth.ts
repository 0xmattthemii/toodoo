import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";

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
  // Verifying email/password accounts lets Better Auth safely link a Google
  // sign-in with the same address to the existing account (it refuses to link
  // into unverified local accounts to prevent pre-registration takeovers).
  // sendOnSignIn covers accounts created before verification existed.
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your toodoo email",
        heading: "Verify your email",
        body: `Hi ${user.name}, confirm this address to secure your account and enable signing in with Google. This link expires in one hour.`,
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
