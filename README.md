# toodoo

A simple, minimalist todo app for teams. Self-host it on your own infrastructure, or [deploy it to Vercel](#deploy-your-own) in a couple of clicks.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2F0xmattthemii%2Ftoodoo&project-name=toodoo&repository-name=toodoo&env=DATABASE_URL,BETTER_AUTH_SECRET&envDescription=Postgres%20connection%20string%20%2B%20session%20signing%20secret%20%28openssl%20rand%20-base64%2032%29&envLink=https%3A%2F%2Fgithub.com%2F0xmattthemii%2Ftoodoo%23getting-started)

- **Tasks** with deadlines, status, and one or more assignees
- **Projects** to group tasks, with member roles (admin / member) and a custom icon + color
- **Invitations** by email — existing users are added instantly, new users join automatically when they sign up
- **Flexible boards** — list or kanban, an explicit "Group by" control, and stackable filters (field → condition) shown as removable badges; drag & drop across kanban columns
- **Saved views** — save any grouping/filter combination as a named view with its own icon and color; views live in the sidebar and can be edited, updated, or deleted

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [Better Auth](https://better-auth.com) — email & password + optional Google sign-in, with optional domain locking for company deployments
- [Drizzle ORM](https://orm.drizzle.team) + plain Postgres — works with [Supabase](https://supabase.com) or any other Postgres, no vendor lock-in
- [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS

## Desktop app

A [Tauri 2](https://tauri.app) shell for Windows and macOS lives in
[`desktop/`](desktop/) — it wraps the deployed web app in a native window with
deep-link support. See [desktop/README.md](desktop/README.md).

## Getting started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the environment file and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Description |
   | --- | --- |
   | `DATABASE_URL` | Postgres connection string (Supabase pooled URL recommended in serverless) |
   | `BETTER_AUTH_SECRET` | Session signing secret — `openssl rand -base64 32` |
   | `BETTER_AUTH_URL` | Base URL of the app (optional on Vercel) |
   | `RESEND_API_KEY` | [Resend](https://resend.com) key for transactional email (password reset, email verification, invites). Optional — emails are skipped and logged when unset |
   | `EMAIL_FROM` | From address for outgoing email (defaults to Resend's onboarding sender) |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional — enables "Continue with Google" (see [Google sign-in](#google-sign-in)) |
   | `AUTH_ALLOWED_EMAIL_DOMAINS` | Optional — comma-separated email domains allowed to create accounts (see [Locking sign-ups to your domain](#locking-sign-ups-to-your-domain)) |
   | `GOOGLE_HOSTED_DOMAIN` | Optional — restrict Google sign-in to one Google Workspace domain |

   For local development you can run a throwaway Postgres:

   ```bash
   docker run -d --name toodoo-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=toodoo -p 54329:5432 postgres:17-alpine
   ```

3. Apply the database schema:

   ```bash
   pnpm drizzle-kit migrate
   ```

4. Run the dev server:

   ```bash
   pnpm dev
   ```

Open [http://localhost:3000](http://localhost:3000), create an account, and start organizing.

## Deploy your own

The fastest path is the **Deploy with Vercel** button above: it forks this repo, creates a Vercel project connected to it, and prompts for the two required env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`). Any Postgres works — [Neon](https://neon.tech), [Supabase](https://supabase.com), or your own. After the first deploy, run the migrations against your database (`pnpm drizzle-kit migrate` with `DATABASE_URL` set) and add the optional env vars below as needed (Google sign-in, domain locking, email).

toodoo is a standard Next.js app, so it also runs anywhere Node.js does — `pnpm build && pnpm start` behind any reverse proxy.

## Google sign-in

Google authentication is optional — without credentials the app runs with email & password only.

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Add an authorized redirect URI for every environment you deploy:

   ```
   <your-base-url>/api/auth/callback/google
   ```

   e.g. `http://localhost:3000/api/auth/callback/google` for local dev and `https://todo.acme.com/api/auth/callback/google` for production. Add the matching origins (`http://localhost:3000`, `https://todo.acme.com`) as authorized JavaScript origins.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Accounts are matched by email, and the two methods merge into one account:

- **Password first, then Google** — a Google sign-in with the same address joins the existing account. If that account hasn't verified its email yet (a verification email is sent on sign-up; skipped when no mailer is set), the login page asks for the password once, then connects Google. From then on either method works.
- **Google first, then password** — open **Profile → Sign-in methods → Set a password** (or use "Forgot password" on the login page) to add one.
- **Connect Google later** — Profile → Sign-in methods → Connect.

Email verification is never required to use the app; it only lets the Google merge skip the password step. Setting a password from a Google-only account needs a working mailer (`RESEND_API_KEY`).

## Locking sign-ups to your domain

Deploying toodoo for your team or company? Two independent locks are available:

- `AUTH_ALLOWED_EMAIL_DOMAINS=acme.com,acme.dev` — only these email domains can create accounts, sign in with Google, or link a Google identity, enforced server-side for every auth method. Project invitations to other domains are rejected up front. Pre-existing password accounts outside the list keep working if you add the lock later (their email/password sign-in is not re-validated).
- `GOOGLE_HOSTED_DOMAIN=acme.com` — additionally requires Google sign-ins to come from that Google Workspace domain, verified against the Google id token (not just the account-picker hint). Set it to `*` to allow any Workspace account while blocking personal Gmail.

## AI agents (MCP)

toodoo ships a built-in [MCP](https://modelcontextprotocol.io) server at `/api/mcp`, secured by OAuth 2.1 (dynamic client registration, PKCE, consent screen). Point any MCP client at the deployment and it can read and write projects and tasks as the authorizing user — the same permission rules as the UI apply.

```bash
claude mcp add --transport http toodoo https://your-deployment.vercel.app/api/mcp
```

The client discovers the authorization server via RFC 9728/8414 metadata, registers itself, and opens the login + consent flow in your browser. Available tools: `list_projects`, `list_project_members`, `list_tasks`, `create_project`, `create_task`, `update_task`, `delete_task`.

## Database

The schema lives in [`src/db/schema`](src/db/schema) and SQL migrations in [`drizzle/`](drizzle). Everything is plain Postgres — swap `DATABASE_URL` to move providers.

## License

[MIT](LICENSE)
