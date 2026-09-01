import { auth } from "@/lib/auth";

// RFC 9728 protected-resource metadata, including the /api/mcp path variant.
export const GET = (request: Request) => auth.handler(request);
export const HEAD = (request: Request) => auth.handler(request);
