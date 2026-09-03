# toodoo

A simple, minimalist todo app for teams. Self-host it on your own infrastructure, or [deploy it to Vercel](#deploy-your-own) in a couple of clicks. Comes with a [desktop app](#desktop-app) for macOS and Windows that connects to your deployment, and a built-in [MCP server](#ai-agents-mcp) for AI agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2F0xmattthemii%2Ftoodoo&project-name=toodoo&repository-name=toodoo&env=DATABASE_URL,BETTER_AUTH_SECRET&envDescription=Postgres%20connection%20string%20%2B%20session%20signing%20secret%20%28openssl%20rand%20-base64%2032%29&envLink=https%3A%2F%2Fgithub.com%2F0xmattthemii%2Ftoodoo%23getting-started)

- **Tasks** with deadlines, status, and one or more assignees
- **Projects** to group tasks, with member roles (admin / member) and a custom icon + color — create one straight from the task dialog
- **Invitations** by email — existing users are added instantly, new users join automatically when they sign up
- **Flexible boards** — list or kanban, an explicit "Group by" control, and stackable filters (field → condition) shown as removable badges; drag & drop tasks across kanban columns or onto a project in the sidebar
- **Saved views** — save any grouping/filter combination as a named view with its own icon and color; views live in the sidebar and can be edited, updated, or deleted

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [Better Auth](https://better-auth.com) — email & password + optional Google sign-in, with optional domain locking for company deployments
- [Drizzle ORM](https://orm.drizzle.team) + plain Postgres — works with [Supabase](https://supabase.com) or any other Postgres, no vendor lock-in
- [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS

## Getting started

Two variables are required; everything else is optional and can be added later (see [Configuration](#configuration)).

1. Install dependencies and create your env file:

   ```bash
   pnpm install
   cp .env.example .env.local
   ```

   Set `DATABASE_URL` (any Postgres) and `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) in `.env.local`. For a throwaway local database:

   ```bash
   docker run -d --name toodoo-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=toodoo -p 54329:5432 postgres:17-alpine
   ```

2. Apply the schema and start the dev server:

   ```bash
   pnpm drizzle-kit migrate
   pnpm dev
   ```

Open [http://localhost:3000](http://localhost:3000), create an account, and start organizing.

## Deploy your own

The fastest path is the **Deploy with Vercel** button above: it forks this repo, creates a Vercel project connected to it, and prompts for the two required env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`). Any Postgres works — [Neon](https://neon.tech), [Supabase](https://supabase.com), or your own. After the first deploy, run the migrations against your database (`pnpm drizzle-kit migrate` with `DATABASE_URL` set) and add the optional env vars below as needed (Google sign-in, domain locking, email).

toodoo is a standard Next.js app, so it also runs anywhere Node.js does — `pnpm build && pnpm start` behind any reverse proxy. Set `BETTER_AUTH_URL` to the public URL when not on Vercel.

## Configuration

All configuration is environment variables. Nothing needs to be edited in the code, and no build step depends on them — set them on the host (Vercel project settings, Docker env, …) and restart.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (pooled URL recommended in serverless) |
| `BETTER_AUTH_SECRET` | yes | Session signing secret — `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | outside Vercel | Public base URL of the app (Vercel deployments detect it) |
| `RESEND_API_KEY` | no | [Resend](https://resend.com) key for password reset, email verification and invitation emails. Without it, emails are skipped and logged |
| `EMAIL_FROM` | no | From address for outgoing email (defaults to Resend's onboarding sender) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables "Continue with Google" — see [Google sign-in](#google-sign-in) |
| `AUTH_ALLOWED_EMAIL_DOMAINS` | no | Comma-separated email domains allowed to create accounts — see [Locking sign-ups](#locking-sign-ups-to-your-domain) |
| `GOOGLE_HOSTED_DOMAIN` | no | Restrict Google sign-in to one Google Workspace domain |
| `DESKTOP_RELEASES_REPO` | no | GitHub `owner/repo` whose releases the in-app install dialog offers. Defaults to this repo — only forks that ship their own desktop build set it |

## Desktop app

toodoo has a native desktop app for macOS and Windows — a [Tauri 2](https://tauri.app) shell around the web app, in [`desktop/`](desktop/). One build works with **any** toodoo deployment: on first launch the app asks which server to connect to. If you self-host, there is nothing to build, sign, or configure — every deployment automatically offers the latest release from inside the app.

### Installing the desktop app (for your users)

Once toodoo is deployed at, say, `https://todo.acme.com`:

1. In toodoo, open the profile menu in the bottom-left corner and choose **Download desktop app**. The dialog has a tab per platform — **macOS** and **Windows** — with the installer and the steps for each.
2. Download the installer for your platform (macOS `.dmg` or Windows `-setup.exe`) and install it. The builds are **not code-signed yet**, so the OS warns once:
   - **macOS** — drag Toodoo to Applications, then run this once in Terminal, otherwise Gatekeeper reports the app as "damaged":

     ```bash
     xattr -d com.apple.quarantine /Applications/Toodoo.app
     ```

   - **Windows** — on the SmartScreen prompt, choose **More info → Run anyway**.
3. Open Toodoo. On the connect screen, enter your toodoo address (`https://todo.acme.com`) and click **Connect** — or, back in the install dialog, click **Open in Toodoo desktop**, which opens the app with the address filled in. Sign in as usual.

The app remembers the server, keeps you signed in like the browser does, and updates itself from the GitHub releases it was built from. To connect to a different server later: **profile menu → Switch server…** (on macOS also **Toodoo → Switch Server…** in the menu bar).

### Where the installers come from

The install dialog links to the latest `desktop-v*` release of the GitHub repository in `DESKTOP_RELEASES_REPO` — by default this one, whose builds work with every deployment. If you fork toodoo and ship your own desktop build, set the variable to your repository; [desktop/README.md](desktop/README.md#shipping-your-own-build) walks through what to change.

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
