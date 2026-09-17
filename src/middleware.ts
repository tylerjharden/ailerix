import {
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth-config";

/**
 * G4 will implement markdown content negotiation (Accept: text/markdown).
 * Returns a rewrite/response when negotiation applies, otherwise null.
 */
export function negotiateMarkdown(_request: NextRequest): NextResponse | null {
  return null;
}

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

const runClerkMiddleware = clerkMiddleware(async (auth, request) => {
  const negotiated = negotiateMarkdown(request);
  if (negotiated) {
    return negotiated;
  }

  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const negotiated = negotiateMarkdown(request);
  if (negotiated) {
    return negotiated;
  }

  if (!authEnabled()) {
    return NextResponse.next();
  }

  return runClerkMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
