import pkg from "../../../../../package.json";

/**
 * Identifies this deployment as a toodoo server. The desktop app fetches it
 * when a user enters a server address, so a typo or an unrelated site is
 * rejected before it can become the app's trusted origin. Public and
 * deterministic, so it's prerendered.
 */
export function GET() {
  return Response.json(
    { app: "toodoo", version: pkg.version },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
