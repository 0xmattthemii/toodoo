# toodoo

A simple, minimalist todo app for teams.

- **Tasks** with deadlines, status, and one or more assignees
- **Projects** to group tasks, with member roles (admin / member) and a custom icon + color
- **Invitations** by email — existing users are added instantly, new users join automatically when they sign up
- **Flexible boards** — list or kanban, an explicit "Group by" control, and stackable filters (field → condition) shown as removable badges; drag & drop across kanban columns
- **Saved views** — save any grouping/filter combination as a named view with its own icon and color; views live in the sidebar and can be edited, updated, or deleted

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [Better Auth](https://better-auth.com) — email & password authentication
- [Drizzle ORM](https://orm.drizzle.team) + plain Postgres — works with [Supabase](https://supabase.com) or any other Postgres, no vendor lock-in
- [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS

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

## Database

The schema lives in [`src/db/schema`](src/db/schema) and SQL migrations in [`drizzle/`](drizzle). Everything is plain Postgres — swap `DATABASE_URL` to move providers.

## License

[MIT](LICENSE)
