import { apiError } from "@/lib/api-error";
import { getBalance, getUsageUsd, SIGNUP_GRANT_USD } from "@/lib/credits";
import { verifyKey, isAilerixApiKeyToken, listKeys } from "@/lib/api-keys";
import { dbAvailable, getPrismaClient } from "@/lib/analytics/db";

const WWW_AUTHENTICATE =
  'Bearer resource_metadata="https://ailerix.com/.well-known/oauth-protected-resource"';

async function usageUsdForAccount(accountId: string): Promise<number> {
  if (!dbAvailable()) {
    return getUsageUsd(accountId);
  }
  try {
    const prisma = getPrismaClient();
    const rows = await prisma.creditLedger.findMany({
      where: { accountId, reason: "usage_debit" },
      select: { deltaUsd: true },
    });
    return rows.reduce((sum, row) => sum + Math.abs(row.deltaUsd), 0);
  } catch {
    return 0;
  }
}

async function keyLabel(
  accountId: string,
  apiKeyId: string,
): Promise<string> {
  if (!dbAvailable()) {
    const keys = await listKeys(accountId);
    return keys.find((k) => k.id === apiKeyId)?.name ?? "API key";
  }
  try {
    const prisma = getPrismaClient();
    const row = await prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { name: true },
    });
    return row?.name ?? "API key";
  } catch {
    return "API key";
  }
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return apiError({
      status: 401,
      message: "API key required.",
      code: "invalid_api_key",
      errorType: "invalid_request",
      headers: { "WWW-Authenticate": WWW_AUTHENTICATE },
    });
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!isAilerixApiKeyToken(token)) {
    return apiError({
      status: 401,
      message: "API key required.",
      code: "invalid_api_key",
      errorType: "invalid_request",
      headers: { "WWW-Authenticate": WWW_AUTHENTICATE },
    });
  }

  const verified = await verifyKey(token);
  if (!verified) {
    return apiError({
      status: 401,
      message: "Invalid API key.",
      code: "invalid_api_key",
      errorType: "invalid_request",
      headers: { "WWW-Authenticate": WWW_AUTHENTICATE },
    });
  }

  const balance = await getBalance(verified.accountId);
  const balanceUsd = balance ?? 0;
  const usageUsd = await usageUsdForAccount(verified.accountId);
  const label = await keyLabel(verified.accountId, verified.apiKeyId);

  return Response.json({
    data: {
      label,
      usage_usd: usageUsd,
      balance_usd: balanceUsd,
      is_free_tier: balanceUsd <= SIGNUP_GRANT_USD,
      anonymous_daily: null,
    },
  });
}
