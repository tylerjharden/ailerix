import { summarize } from "@/lib/analytics/store";

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

function parseDays(url: URL): number {
  const raw = url.searchParams.get("days");
  if (raw === "30") {
    return 30;
  }
  return 7;
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

  const days = parseDays(new URL(request.url));
  const summary = await summarize({ days });
  return Response.json(summary);
}
