import { requireMcpAuth } from "@better-auth/mcp";

import { appBaseURL, auth } from "@/lib/auth";
import { mcpHandlerFor } from "@/lib/mcp";

export const maxDuration = 60;

const handler = requireMcpAuth(
  auth,
  async (req, claims) => {
    const userId = String(claims.sub);
    return mcpHandlerFor(userId)(req);
  },
  {
    resource: `${appBaseURL}/api/mcp`,
    issuer: `${appBaseURL}/api/auth`,
    jwksUrl: `${appBaseURL}/api/auth/jwks`,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
