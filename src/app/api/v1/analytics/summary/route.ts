import { summarize } from "@/lib/analytics/store";

// Aggregate-only analytics: no prompts, generation ids, or provider slugs.
// Public so the dashboard Overview works on deployed hosts without auth.
// Per-request data stays operator-gated in ./events.

function parseDays(url: URL): number {
  const raw = url.searchParams.get("days");
  if (raw === "30") {
    return 30;
  }
  return 7;
}

export async function GET(request: Request) {
  const days = parseDays(new URL(request.url));
  const summary = await summarize({ days });
  return Response.json(summary);
}
