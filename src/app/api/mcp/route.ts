import { requireMcpAuth } from "@better-auth/mcp";

import { appBaseURL, auth } from "@/lib/auth";
import { mcpHandlerFor } from "@/lib/mcp";
import { getWorkspaceRole } from "@/lib/workspace-access";

export const maxDuration = 60;

const handler = requireMcpAuth(
  auth,
  async (req, claims) => {
    const userId = String(claims.sub);
    // A token outlives a removal from the workspace; the removal wins.
    if (!(await getWorkspaceRole(userId))) {
      return Response.json(
        { error: "You don't have access to this workspace" },
        { status: 403 },
      );
    }
    return mcpHandlerFor(userId)(req);
  },
  {
    resource: `${appBaseURL}/api/mcp`,
    issuer: `${appBaseURL}/api/auth`,
    jwksUrl: `${appBaseURL}/api/auth/jwks`,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
