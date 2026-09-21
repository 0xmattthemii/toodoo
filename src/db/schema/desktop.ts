import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Desktop sign-in handoffs waiting to be claimed.
 *
 * The desktop shell sends the user to their own browser to sign in with
 * Google: Google refuses OAuth in embedded webviews (RFC 8252), and the
 * browser already carries the user's Google session, password manager,
 * passkeys and any Workspace IdP. The session that results lives in the
 * browser's cookie jar, so it has to be handed back to the app's webview.
 *
 * One row is one handoff in flight. The shell keeps a random verifier and
 * sends only its SHA-256 (`challenge`) into the browser, so the row can only
 * be claimed by the process that started the flow — a second app registered
 * for the shared `toodoo://` scheme that intercepts the callback learns an id
 * it cannot redeem. Rows are deleted the moment they are claimed and expire a
 * couple of minutes after they are created.
 */
export const desktopSignIn = pgTable(
  "desktop_sign_in",
  {
    id: text("id").primaryKey(),
    /** Lowercase hex SHA-256 of the shell's verifier. */
    challenge: text("challenge").notNull(),
    /** One-time token the webview redeems for the browser's session. */
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Only used by the sweep of expired rows on insert.
  (table) => [index("desktop_sign_in_expires_at_idx").on(table.expiresAt)],
);
