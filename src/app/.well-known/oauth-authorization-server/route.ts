import { apiError } from "@/lib/api-error";

export const revalidate = 300;

function decodePublishableKeyDomain(key: string): string | null {
  const encoded = key.replace(/^pk_(test|live)_/, "");
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const domain = decoded.replace(/\$$/, "");
    return domain.includes(".") ? domain : null;
  } catch {
    return null;
  }
}

function authorizationServerDomain(): string | null {
  const explicit = process.env.CLERK_OAUTH_AS_DOMAIN;
  if (explicit) return explicit;
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (publishable) return decodePublishableKeyDomain(publishable);
  return null;
}

export async function GET() {
  const domain = authorizationServerDomain();
  if (!domain) {
    return apiError({
      status: 404,
      message: "No authorization server is configured on this deployment.",
      code: "not_found",
      errorType: "not_found",
    });
  }

  const upstream = await fetch(
    `https://${domain}/.well-known/oauth-authorization-server`,
    { next: { revalidate: 300 } },
  );
  if (!upstream.ok) {
    return apiError({
      status: 502,
      message: "Authorization server metadata is unavailable.",
      code: "provider_unavailable",
      errorType: "provider_unavailable",
    });
  }

  const metadata = await upstream.json();
  return Response.json(metadata, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
