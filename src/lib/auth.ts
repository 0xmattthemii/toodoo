import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema/auth";
import { sendEmail } from "@/lib/email";

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
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
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
