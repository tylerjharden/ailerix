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
      // First entry: the real AS (Clerk). Second: this origin, which proxies
      // the same metadata plus the WorkOS-convention agent_auth block.
      authorization_servers: fallbackAs
        ? [`https://${fallbackAs}`, "https://ailerix.com"]
        : ["https://ailerix.com"],
      scopes_supported: ["openid", "profile", "email"],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://ailerix.com/auth.md",
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
