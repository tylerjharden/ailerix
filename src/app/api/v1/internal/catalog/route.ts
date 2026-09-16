import { loadSnapshot } from "@/lib/aa/load";

function isCatalogAuthorized(request: Request): boolean {
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

export async function GET(request: Request) {
  if (!isCatalogAuthorized(request)) {
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

  return Response.json(loadSnapshot());
}
