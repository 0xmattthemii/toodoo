import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { allowedEmailDomains, googleAuthEnabled } from "@/lib/auth-flags";
import { sendEmail } from "@/lib/email";

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
  emailVerification: {
    sendOnSignUp: true,
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
  socialProviders: googleAuthEnabled
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
  databaseHooks: allowedEmailDomains.length
    ? {
        user: {
          create: {
            before: async (user) => {
              const domain = user.email.split("@").at(-1)?.toLowerCase();
              if (!domain || !allowedEmailDomains.includes(domain)) {
                throw new APIError("FORBIDDEN", {
                  code: "signup_domain_restricted",
                  message: `Sign-ups on this toodoo instance are limited to ${allowedEmailDomains
                    .map((d) => `@${d}`)
                    .join(", ")} email addresses`,
                });
              }
            },
          },
        },
      }
    : undefined,
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
