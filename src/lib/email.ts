import "server-only";

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM ?? "toodoo <onboarding@resend.dev>";

/** Base URL used for links inside emails. */
export function appUrl(path = "") {
  const base =
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  return `${base}${path}`;
}

/**
 * Sends an email through Resend. When RESEND_API_KEY is not configured the
 * call becomes a logged no-op so flows keep working in development.
 */
export async function sendEmail({
  to,
  subject,
  heading,
  body,
  actionLabel,
  actionUrl,
}: {
  to: string;
  subject: string;
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
}) {
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping "${subject}" to ${to} (${actionUrl})`,
    );
    return;
  }

  const html = `
<div style="font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #171717;">
  <p style="font-weight: 700; font-size: 18px; margin: 0 0 24px;">toodoo</p>
  <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 12px;">${heading}</h1>
  <p style="font-size: 14px; line-height: 1.6; color: #525252; margin: 0 0 24px;">${body}</p>
  <a href="${actionUrl}" style="display: inline-block; background: #171717; color: #fafafa; font-size: 14px; font-weight: 500; padding: 10px 18px; border-radius: 10px; text-decoration: none;">${actionLabel}</a>
  <p style="font-size: 12px; color: #a3a3a3; margin: 32px 0 0;">If you weren't expecting this email, you can safely ignore it.</p>
</div>`;

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    text: `${heading}\n\n${body}\n\n${actionLabel}: ${actionUrl}`,
  });
}
