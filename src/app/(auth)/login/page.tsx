import { connection } from "next/server";

import { googleAuthEnabled } from "@/lib/auth-flags";

import { LoginForm } from "./login-form";

// Rendered at request time (connection) so self-hosted builds pick up auth
// env vars set after the image was built (Docker etc.), not build-time values.
export default async function LoginPage() {
  await connection();
  return (
    <>
      <LoginForm googleEnabled={googleAuthEnabled()} />
      <p className="text-center text-xs text-balance text-muted-foreground">
        Simple, minimalist todos for teams.
      </p>
    </>
  );
}
