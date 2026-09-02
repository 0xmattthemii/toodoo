import { connection } from "next/server";

import { googleAuthEnabled } from "@/lib/auth-flags";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Render at request time so self-hosted builds pick up auth env vars set
  // after the image was built (Docker etc.), not a value frozen at build.
  await connection();
  return <LoginForm googleEnabled={googleAuthEnabled} />;
}
