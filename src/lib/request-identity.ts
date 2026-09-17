import { auth } from "@clerk/nextjs/server";

import { verifyKey, isAilerixApiKeyToken } from "@/lib/api-keys";
import { authEnabled } from "@/lib/auth-config";
import { ensureAccount, hashAnonId } from "@/lib/credits";

export type RequestIdentity =
  | { kind: "key"; accountId: string; apiKeyId: string }
  | { kind: "session"; accountId: string }
  | { kind: "anon"; anonId: string };

function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip") ?? "0.0.0.0";
}

export function anonIdForRequest(request: Request): string {
  const day = utcDayKey();
  return hashAnonId(clientIp(request), day);
}

export type ResolveIdentityResult =
  | { ok: true; identity: RequestIdentity }
  | { ok: false; reason: "invalid_api_key" };

export async function resolveRequestIdentity(
  request: Request,
): Promise<ResolveIdentityResult> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (isAilerixApiKeyToken(token)) {
      const verified = await verifyKey(token);
      if (!verified) {
        return { ok: false, reason: "invalid_api_key" };
      }
      return {
        ok: true,
        identity: {
          kind: "key",
          accountId: verified.accountId,
          apiKeyId: verified.apiKeyId,
        },
      };
    }
  }

  if (authEnabled()) {
    try {
      const session = await auth();
      if (session.userId) {
        const email =
          session.sessionClaims?.email &&
          typeof session.sessionClaims.email === "string"
            ? session.sessionClaims.email
            : undefined;
        const account = await ensureAccount(session.userId, email);
        if (account) {
          return {
            ok: true,
            identity: { kind: "session", accountId: account.id },
          };
        }
      }
    } catch {
      // fall through to anonymous
    }
  }

  return {
    ok: true,
    identity: { kind: "anon", anonId: anonIdForRequest(request) },
  };
}

export function identityFields(identity: RequestIdentity): {
  accountId: string | null;
  apiKeyId: string | null;
  anonId: string | null;
} {
  switch (identity.kind) {
    case "key":
      return {
        accountId: identity.accountId,
        apiKeyId: identity.apiKeyId,
        anonId: null,
      };
    case "session":
      return {
        accountId: identity.accountId,
        apiKeyId: null,
        anonId: null,
      };
    case "anon":
      return {
        accountId: null,
        apiKeyId: null,
        anonId: identity.anonId,
      };
    default: {
      const _exhaustive: never = identity;
      throw new Error(`Unhandled identity: ${String(_exhaustive)}`);
    }
  }
}
