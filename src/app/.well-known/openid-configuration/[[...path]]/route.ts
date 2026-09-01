import { auth } from "@/lib/auth";

async function serve(request: Request) {
  const response = await auth.handler(request);
  if (response.status !== 404) return response;
  const url = new URL(request.url);
  url.pathname = "/.well-known/openid-configuration/api/auth";
  return auth.handler(new Request(url, request));
}

export const GET = serve;
export const HEAD = serve;
