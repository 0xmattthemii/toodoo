# toodoo

A simple, minimalist todo app for teams. Self-host it or [deploy it to Vercel](#deploy-your-own) in a couple of clicks. It comes with a [desktop app](#desktop-app) for macOS and Windows and a built-in [MCP server](#ai-agents-mcp) for AI agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2F0xmattthemii%2Ftoodoo&project-name=toodoo&repository-name=toodoo&env=DATABASE_URL,BETTER_AUTH_SECRET&envDescription=Postgres%20connection%20string%20%2B%20session%20signing%20secret%20%28openssl%20rand%20-base64%2032%29&envLink=https%3A%2F%2Fgithub.com%2F0xmattthemii%2Ftoodoo%23getting-started)

![toodoo: a kanban board grouped by project](docs/screenshot.png)

- **Tasks** with deadlines, status and several assignees
- **Projects** with admin/member roles, an icon and a color
- **Invitations** by email. Accounts with a verified address are added right away, everyone else once they confirm their address
- **Boards** as a list or kanban, with group by, sort and stackable filters. Drag to reorder tasks, move them between columns or projects, and rearrange the sidebar
- **Saved views** that keep any board setup in the sidebar

Built with [Next.js](https://nextjs.org), [Better Auth](https://better-auth.com), [Drizzle](https://orm.drizzle.team) on plain Postgres (Supabase, Neon or your own) and [shadcn/ui](https://ui.shadcn.com).

## Getting started

```bash
pnpm install
cp .env.example .env.local   # set DATABASE_URL and BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm drizzle-kit migrate
pnpm dev
```

No Postgres at hand? Start a throwaway one and set `DATABASE_URL=postgresql://postgres:postgres@localhost:54329/toodoo`:

```bash
docker run -d --name toodoo-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=toodoo -p 54329:5432 postgres:17-alpine
```

Open [http://localhost:3000](http://localhost:3000) and create an account.

### Tests

The tests run the server actions against a real Postgres database, which they erase first. Point them at a separate local database whose name contains `test`:

```bash
docker exec toodoo-pg createdb -U postgres toodoo_test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/toodoo_test pnpm test
```

CI runs lint, these tests, a production build and the desktop app's unit tests on every pull request.

## Deploy your own

- **Vercel:** the **Deploy with Vercel** button above forks the repo and asks for `DATABASE_URL` and `BETTER_AUTH_SECRET`. After the first deploy, run `pnpm drizzle-kit migrate` against your database.
- **Anywhere else:** it's a standard Next.js app. Run `pnpm build && pnpm start` behind a reverse proxy and set `BETTER_AUTH_URL`.

## Configuration

Everything is set through environment variables. No code changes or rebuilds are needed.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (use a pooled URL on serverless) |
| `DATABASE_CA_CERT` | no | PEM certificate of your database's CA, for providers that don't use a publicly trusted one (such as Supabase's pooler). Certificates are always verified for remote databases |
| `BETTER_AUTH_SECRET` | yes | Session signing secret (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | outside Vercel | Public base URL of the app |
| `RESEND_API_KEY` | no | [Resend](https://resend.com) key for reset, verification and invitation emails. Without it, emails are only logged, and invitations can only be accepted through Google sign-in (see below) |
| `EMAIL_FROM` | no | Sender address for outgoing email |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Turns on [Google sign-in](#google-sign-in) |
| `AUTH_ALLOWED_EMAIL_DOMAINS` | no | Comma-separated domains allowed to sign up, for example `acme.com,acme.dev` |
| `GOOGLE_HOSTED_DOMAIN` | no | Only accept Google sign-ins from this Workspace domain (`*` means any Workspace, but no personal Gmail) |
| `DESKTOP_RELEASES_REPO` | no | GitHub `owner/repo` the desktop download dialog points to. Only forks that ship their own build need it |

The domain lock is enforced on the server for every sign-in method, and invitations to other domains are rejected. Password accounts created before you add the lock keep working.

An invitation only turns into a membership once the invitee has proven they own the address: by clicking the verification email, or by signing in with Google. A domain lock doesn't replace that, since anyone can type a colleague's address into the sign-up form. Without `RESEND_API_KEY` no verification email goes out, so password-only invitees stay pending until they sign in with Google.

## Google sign-in

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create a **Web application** OAuth client.
2. Add `<your-base-url>/api/auth/callback/google` as a redirect URI, and the base URL as a JavaScript origin, for each environment.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Google and password sign-ins with the same email share one account. To add the missing method later, go to **Profile → Sign-in methods** (setting a password needs `RESEND_API_KEY`).

## Desktop app

A [Tauri 2](https://tauri.app) app for macOS and Windows (see [`desktop/`](desktop/)). One build works with any toodoo deployment, so self-hosters have nothing to build or sign.

### Installing the desktop app

1. In toodoo, open the profile menu and choose **Download desktop app**.
2. Install it. The builds aren't code-signed yet:
   - **macOS:** after moving it to Applications, run `xattr -d com.apple.quarantine /Applications/Toodoo.app` once, or macOS will say the app is "damaged".
   - **Windows:** on the SmartScreen prompt, choose **More info → Run anyway**.
3. Open Toodoo and enter your server address, or click **Open in Toodoo desktop** from the download dialog.

The app updates itself. To connect to another server, use **profile menu → Switch server…**. **Continue with Google** opens your usual browser, because Google blocks sign-in inside embedded windows. To publish your own build, see [desktop/README.md](desktop/README.md#shipping-your-own-build).

## AI agents (MCP)

A built-in [MCP](https://modelcontextprotocol.io) server at `/api/mcp`, secured with OAuth 2.1. Agents act as the user who authorized them and follow the same permissions as the UI.

```bash
claude mcp add --transport http toodoo https://your-deployment.vercel.app/api/mcp
```

Tools: `list_projects`, `list_project_members`, `list_tasks`, `create_project`, `create_task`, `update_task`, `delete_task`.

## Database

Schema in [`src/db/schema`](src/db/schema), migrations in [`drizzle/`](drizzle). It's plain Postgres, so you can switch providers by changing `DATABASE_URL`.

## License

[MIT](LICENSE)
