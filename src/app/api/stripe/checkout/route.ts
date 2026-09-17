import { auth } from "@clerk/nextjs/server";

import { apiError } from "@/lib/api-error";
import { authEnabled } from "@/lib/auth-config";
import { ensureAccount } from "@/lib/credits";
import {
  appBaseUrl,
  creditPackById,
  getStripe,
  isCreditPackId,
  stripeEnabled,
} from "@/lib/stripe";

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

export async function POST(request: Request) {
  if (!stripeEnabled()) {
    return apiError({
      status: 503,
      message: "Stripe is not configured.",
      code: "stripe_not_configured",
      errorType: "server",
    });
  }

  const account = await sessionAccount();
  if (!account) {
    return apiError({
      status: authEnabled() ? 401 : 503,
      message: authEnabled()
        ? "Sign in to purchase credits."
        : "Authentication is not configured.",
      code: authEnabled() ? "unauthorized" : "auth_not_configured",
      errorType: "invalid_request",
    });
  }

  let body: { pack?: string };
  try {
    body = (await request.json()) as { pack?: string };
  } catch {
    return apiError({
      status: 400,
      message: "Invalid JSON body.",
      code: "invalid_request",
      errorType: "invalid_request",
    });
  }

  const packId = typeof body.pack === "string" ? body.pack : "";
  if (!isCreditPackId(packId)) {
    return apiError({
      status: 400,
      message: "Unknown credit pack.",
      code: "invalid_request",
      errorType: "invalid_request",
    });
  }

  const pack = creditPackById(packId);
  if (!pack) {
    return apiError({
      status: 400,
      message: "Unknown credit pack.",
      code: "invalid_request",
      errorType: "invalid_request",
    });
  }

  const base = appBaseUrl(request);
  const stripe = getStripe();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      metadata: {
        accountId: account.accountId,
        pack: pack.id,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(pack.usd * 100),
            product_data: {
              name: pack.title,
              description: `${pack.usd.toFixed(2)} USD in Ailerix API credits`,
            },
          },
        },
      ],
      success_url: `${base}/dashboard?tab=credits&status=success`,
      cancel_url: `${base}/dashboard?tab=credits&status=cancelled`,
    });

    if (!session.url) {
      return apiError({
        status: 500,
        message: "Could not create checkout session.",
        code: "server_error",
        errorType: "server",
      });
    }

    return Response.json({ data: { url: session.url } });
  } catch {
    return apiError({
      status: 500,
      message: "Could not create checkout session.",
      code: "server_error",
      errorType: "server",
    });
  }
}
