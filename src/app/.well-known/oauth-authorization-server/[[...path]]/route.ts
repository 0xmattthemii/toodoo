import { auth } from "@/lib/auth";

// RFC 8414: the issuer includes the /api/auth base path, so clients request
// /.well-known/oauth-authorization-server/api/auth. Serve the bare form too
// by retrying with the issuer path appended.
async function serve(request: Request) {
  const response = await auth.handler(request);
  if (response.status !== 404) return response;
  const url = new URL(request.url);
  url.pathname = "/.well-known/oauth-authorization-server/api/auth";
  return auth.handler(new Request(url, request));
}

export const GET = serve;
export const HEAD = serve;
