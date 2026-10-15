import { connection } from "next/server";

import { allowedEmailDomains, googleAuthEnabled } from "@/lib/auth-flags";
import { getWorkspaceSettings } from "@/lib/workspace-access";

import { SignupForm } from "./signup-form";

// Rendered at request time (connection) so self-hosted builds pick up auth
// env vars set after the image was built (Docker etc.), not build-time values.
export default async function SignupPage() {
  await connection();
  const { signupsEnabled } = await getWorkspaceSettings();
  return (
    <>
      <SignupForm
        googleEnabled={googleAuthEnabled()}
        allowedDomains={allowedEmailDomains()}
        inviteOnly={!signupsEnabled}
      />
      <p className="text-center text-xs text-balance text-muted-foreground">
        Simple, minimalist todos for teams.
      </p>
    </>
  );
}
