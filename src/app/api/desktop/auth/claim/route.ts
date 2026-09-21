import { claimHandoff, isValidVerifier } from "@/lib/desktop-auth";

const NO_STORE = { "Cache-Control": "no-store" };

/** A handoff id is the uuid `createHandoff` returns. */
function isValidHandoffId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}

/**
 * Called by the desktop shell — not by any page — with the handoff id it got
 * through `toodoo://` and the verifier it has kept since it started the flow.
 * Answers with the one-time token, once.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const { id, verifier } = (body ?? {}) as Record<string, unknown>;
  const invalid = Response.json(
    { error: "invalid_handoff" },
    { status: 400, headers: NO_STORE },
  );
  if (!isValidHandoffId(id) || !isValidVerifier(verifier)) return invalid;

  const token = await claimHandoff(id, verifier);
  if (!token) return invalid;
  return Response.json({ token }, { headers: NO_STORE });
}
