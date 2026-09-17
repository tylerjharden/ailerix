import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next";

import { mcpOAuthEnabled } from "@/lib/mcp-tools";

function clerkProtectedResourceConfigured(): boolean {
  return mcpOAuthEnabled() && Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

const clerkHandler = protectedResourceHandlerClerk();
const corsOptions = metadataCorsOptionsRequestHandler();

export function GET(request: Request) {
  if (clerkProtectedResourceConfigured()) {
    return clerkHandler(request);
  }
  const fallbackAs = process.env.CLERK_OAUTH_AS_DOMAIN;
  return Response.json(
    {
      resource: "https://ailerix.com",
      authorization_servers: fallbackAs ? [`https://${fallbackAs}`] : [],
    },
    {
      headers: {
        "Cache-Control": "max-age=3600",
        "Content-Type": "application/json",
      },
    },
  );
}

export function OPTIONS() {
  return corsOptions();
}
