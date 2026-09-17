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

const CORS_PATH = /^\/(api\/(v1|acp|mcp)|\.well-known)\//;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Idempotency-Key, Request-Id, X-Ailerix-Reveal-Route, X-Ailerix-Operator, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "X-Ailerix-Generation-Id, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

/**
 * Public-API CORS so browsers and hosted demos (e.g. the Hugging Face Space)
 * can call the gateway directly. Returns a preflight response or decorates
 * the passed response.
 */
function applyCors(
  request: NextRequest,
  response?: NextResponse,
): NextResponse | null {
  if (!CORS_PATH.test(request.nextUrl.pathname)) {
    return response ?? null;
  }
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const res = response ?? NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}

const runClerkMiddleware = clerkMiddleware(async (auth, request) => {
  const negotiated = negotiateMarkdown(request);
  if (negotiated) {
    return negotiated;
  }

  const cors = applyCors(request);
  if (cors) {
    return cors;
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
    return applyCors(request) ?? NextResponse.next();
  }

  return runClerkMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
