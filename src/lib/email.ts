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

/** Escapes a string for interpolation into the email's HTML template. */
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

  // Heading/body can embed user-provided values (names, project titles);
  // escape everything so a crafted name can't inject markup into an email
  // sent from the deployment's verified domain.
  const html = `
<div style="font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #171717;">
  <p style="font-weight: 700; font-size: 18px; margin: 0 0 24px;">toodoo</p>
  <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 12px;">${escapeHtml(heading)}</h1>
  <p style="font-size: 14px; line-height: 1.6; color: #525252; margin: 0 0 24px;">${escapeHtml(body)}</p>
  <a href="${escapeHtml(actionUrl)}" style="display: inline-block; background: #171717; color: #fafafa; font-size: 14px; font-weight: 500; padding: 10px 18px; border-radius: 10px; text-decoration: none;">${escapeHtml(actionLabel)}</a>
  <p style="font-size: 12px; color: #a3a3a3; margin: 32px 0 0;">If you weren't expecting this email, you can safely ignore it.</p>
</div>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    text: `${heading}\n\n${body}\n\n${actionLabel}: ${actionUrl}`,
  });
  if (error) {
    // The SDK reports failures instead of throwing; surface them.
    console.error(`[email] failed to send "${subject}" to ${to}:`, error);
    throw new Error(error.message);
  }
}
