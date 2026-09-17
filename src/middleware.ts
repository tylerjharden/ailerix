import {
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth-config";

const MARKDOWN_SLUG_BY_PATH: Record<string, string> = {
  "/": "index",
  "/docs": "docs",
  "/models": "models",
  "/playground": "playground",
  "/dashboard": "dashboard",
};

/**
 * When clients request Markdown (e.g. agents), rewrite to hand-authored summaries.
 */
export function negotiateMarkdown(request: NextRequest): NextResponse | null {
  if (request.method !== "GET") {
    return null;
  }

  const accept = request.headers.get("accept") ?? "";
  if (!accept.toLowerCase().includes("text/markdown")) {
    return null;
  }

  const slug = MARKDOWN_SLUG_BY_PATH[request.nextUrl.pathname];
  if (!slug) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/md/${slug}`;
  return NextResponse.rewrite(url);
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
