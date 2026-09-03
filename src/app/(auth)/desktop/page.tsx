import type { Metadata } from "next";
import { connection } from "next/server";

import { getDesktopDownloads } from "@/lib/desktop";

import { DesktopDownloadCard } from "./desktop-download-card";

export const metadata: Metadata = {
  title: "Toodoo for desktop",
  description: "Install the Toodoo desktop app and connect it to this server.",
};

// Request time (connection) so DESKTOP_RELEASES_REPO is read from the running
// deployment's env, not baked in at build; the GitHub lookup itself is cached.
export default async function DesktopPage() {
  await connection();
  const downloads = await getDesktopDownloads();
  return <DesktopDownloadCard downloads={downloads} />;
}
