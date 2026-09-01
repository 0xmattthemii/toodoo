import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
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
