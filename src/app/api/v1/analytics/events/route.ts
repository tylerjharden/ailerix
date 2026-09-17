import { listEvents } from "@/lib/analytics/store";

function isAnalyticsAuthorized(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  const operatorKey = process.env.AILERIX_OPERATOR_KEY;
  if (!operatorKey) {
    return false;
  }
  const header = request.headers.get("x-ailerix-operator");
  return header === operatorKey;
}

function parseLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (!raw) {
    return 50;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 50;
  }
  return Math.min(parsed, 200);
}

export async function GET(request: Request) {
  if (!isAnalyticsAuthorized(request)) {
    return Response.json(
      {
        error: {
          message: "Not found",
          type: "invalid_request_error",
          code: "not_found",
        },
      },
      { status: 404 },
    );
  }

  const limit = parseLimit(new URL(request.url));
  const events = await listEvents({ limit });
  return Response.json({ data: events });
}
