import { auth } from "@clerk/nextjs/server";

import { apiError } from "@/lib/api-error";
import { authEnabled } from "@/lib/auth-config";
import { createKey, listKeys, revokeKey } from "@/lib/api-keys";
import { ensureAccount } from "@/lib/credits";

async function sessionAccount(): Promise<{ accountId: string } | null> {
  if (!authEnabled()) {
    return null;
  }
  const session = await auth();
  if (!session.userId) {
    return null;
  }
  const email =
    session.sessionClaims?.email &&
    typeof session.sessionClaims.email === "string"
      ? session.sessionClaims.email
      : undefined;
  const account = await ensureAccount(session.userId, email);
  if (!account) {
    return null;
  }
  return { accountId: account.id };
}

export async function GET() {
  const account = await sessionAccount();
  if (!account) {
    return apiError({
      status: authEnabled() ? 401 : 503,
      message: authEnabled()
        ? "Sign in to manage API keys."
        : "Authentication is not configured.",
      code: authEnabled() ? "unauthorized" : "auth_not_configured",
      errorType: "invalid_request",
    });
  }

  const keys = await listKeys(account.accountId);
  return Response.json({ data: keys });
}

export async function POST(request: Request) {
  const account = await sessionAccount();
  if (!account) {
    return apiError({
      status: authEnabled() ? 401 : 503,
      message: authEnabled()
        ? "Sign in to manage API keys."
        : "Authentication is not configured.",
      code: authEnabled() ? "unauthorized" : "auth_not_configured",
      errorType: "invalid_request",
    });
  }

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return apiError({
      status: 400,
      message: "Invalid JSON body.",
      code: "invalid_request",
      errorType: "invalid_request",
    });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return apiError({
      status: 400,
      message: "Key name is required.",
      code: "invalid_request",
      errorType: "invalid_request",
    });
  }

  const created = await createKey(account.accountId, name);
  if (!created) {
    return apiError({
      status: 500,
      message: "Could not create API key.",
      code: "server_error",
      errorType: "server",
    });
  }

  return Response.json({
    data: {
      id: created.id,
      name,
      prefix: created.prefix,
      key: created.key,
    },
  });
}

export async function DELETE(request: Request) {
  const account = await sessionAccount();
  if (!account) {
    return apiError({
      status: authEnabled() ? 401 : 503,
      message: authEnabled()
        ? "Sign in to manage API keys."
        : "Authentication is not configured.",
      code: authEnabled() ? "unauthorized" : "auth_not_configured",
      errorType: "invalid_request",
    });
  }

  const url = new URL(request.url);
  const keyId = url.searchParams.get("id");
  if (!keyId) {
    return apiError({
      status: 400,
      message: "Query parameter `id` is required.",
      code: "invalid_request",
      errorType: "invalid_request",
    });
  }

  const ok = await revokeKey(account.accountId, keyId);
  if (!ok) {
    return apiError({
      status: 404,
      message: "API key not found.",
      code: "not_found",
      errorType: "not_found",
    });
  }

  return Response.json({ data: { revoked: true } });
}
