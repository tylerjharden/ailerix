import Stripe from "stripe";

export type CreditPackId = "CREDITS-5" | "CREDITS-20" | "CREDITS-100";

export type CreditPack = {
  id: CreditPackId;
  usd: number;
  title: string;
};

export const CREDIT_PACKS: CreditPack[] = [
  { id: "CREDITS-5", usd: 5, title: "$5 credit pack" },
  { id: "CREDITS-20", usd: 20, title: "$20 credit pack" },
  { id: "CREDITS-100", usd: 100, title: "$100 credit pack" },
];

let stripeClient: Stripe | null = null;

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!stripeEnabled()) {
    throw new Error("Stripe is not configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeClient;
}

export function creditPackById(packId: string): CreditPack | null {
  for (const pack of CREDIT_PACKS) {
    if (pack.id === packId) {
      return pack;
    }
  }
  return null;
}

export function isCreditPackId(value: string): value is CreditPackId {
  switch (value) {
    case "CREDITS-5":
    case "CREDITS-20":
    case "CREDITS-100":
      return true;
    default:
      return false;
  }
}

export function appBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) {
    return fromEnv;
  }
  const origin = request.headers.get("origin");
  if (origin) {
    return origin.replace(/\/$/, "");
  }
  return "http://localhost:43147";
}
