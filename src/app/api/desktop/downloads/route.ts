import { connection } from "next/server";

import { getDesktopDownloads } from "@/lib/desktop";

/**
 * Installer links for the latest desktop release, for the in-app install
 * dialog. Request time (connection) so DESKTOP_RELEASES_REPO is read from the
 * running deployment's env rather than baked in at build; the GitHub lookup
 * behind it is cached for five minutes, and any failure degrades to the
 * releases page instead of erroring.
 */
export async function GET() {
  await connection();
  const downloads = await getDesktopDownloads();
  return Response.json(downloads, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
