import { connection } from "next/server";

import { allowedEmailDomains, googleAuthEnabled } from "@/lib/auth-flags";

import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  // Render at request time so self-hosted builds pick up auth env vars set
  // after the image was built (Docker etc.), not a value frozen at build.
  await connection();
  return (
    <SignupForm
      googleEnabled={googleAuthEnabled}
      allowedDomains={allowedEmailDomains}
    />
  );
}
