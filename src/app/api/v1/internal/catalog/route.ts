import { loadSnapshot } from "@/lib/aa/load";
import { apiError } from "@/lib/api-error";

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
    return apiError({
      status: 404,
      message: "Not found",
      code: "not_found",
      errorType: "not_found",
    });
  }

  return Response.json(loadSnapshot());
}
