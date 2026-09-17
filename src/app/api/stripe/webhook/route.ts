import Stripe from "stripe";

import { creditPackById, getStripe, stripeEnabled } from "@/lib/stripe";
import { grantCredits, hasLedgerRef } from "@/lib/credits";

export async function POST(request: Request) {
  if (!stripeEnabled()) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("Webhook secret not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const sessionId = session.id;
    const accountId = session.metadata?.accountId;
    const packId = session.metadata?.pack;

    if (accountId && packId && sessionId) {
      const alreadyGranted = await hasLedgerRef(sessionId);
      if (!alreadyGranted) {
        const pack = creditPackById(packId);
        if (pack) {
          await grantCredits({
            accountId,
            usd: pack.usd,
            reason: "stripe_checkout",
            ref: sessionId,
          });
        }
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
