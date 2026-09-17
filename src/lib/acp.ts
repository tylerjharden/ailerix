import { createHmac, randomUUID } from "node:crypto";

import { dbAvailable, getPrismaClient } from "@/lib/analytics/db";
import { ensureAccountByEmail, grantCredits } from "@/lib/credits";
import { CREDIT_PACKS, stripeEnabled } from "@/lib/stripe";

export const ACP_PROTOCOL = {
  name: "acp",
  version: "2026-04-17",
} as const;

export const ACP_API_BASE = "https://ailerix.com/api/acp";

export type AcpSessionStatus =
  | "ready_for_payment"
  | "completed"
  | "canceled";

export type AcpLineItemInput = {
  item_id: string;
  quantity?: number;
};

export type AcpBuyerInput = {
  email?: string;
};

export type AcpSessionRecord = {
  id: string;
  status: AcpSessionStatus;
  items: AcpLineItemInput[];
  buyer: AcpBuyerInput;
  totalMinor: number;
  currency: string;
  orderId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type StoredLineItem = {
  item_id: string;
  title: string;
  quantity: number;
  subtotal: string;
  tax: string;
  total: string;
};

const memorySessions = new Map<string, AcpSessionRecord>();
const idempotencyResponses = new Map<
  string,
  { status: number; body: unknown; sessionId: string }
>();

const TOS_URL = "https://ailerix.com/terms";
const PRIVACY_URL = "https://ailerix.com/privacy";

function packById(itemId: string) {
  return CREDIT_PACKS.find((p) => p.id === itemId);
}

function minorUnits(usd: number): number {
  return Math.round(usd * 100);
}

function minorString(minor: number): string {
  return String(minor);
}

export function resolveLineItems(
  inputs: AcpLineItemInput[],
): { lineItems: StoredLineItem[]; totalMinor: number; grantUsd: number } {
  if (inputs.length === 0) {
    throw new Error("At least one line item is required.");
  }

  const lineItems: StoredLineItem[] = [];
  let totalMinor = 0;
  let grantUsd = 0;

  for (const input of inputs) {
    const pack = packById(input.item_id);
    if (!pack) {
      throw new Error(`Unknown item_id: ${input.item_id}`);
    }
    const quantity = input.quantity ?? 1;
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error(`Invalid quantity for ${input.item_id}`);
    }
    const lineMinor = minorUnits(pack.usd) * quantity;
    totalMinor += lineMinor;
    grantUsd += pack.usd * quantity;
    lineItems.push({
      item_id: pack.id,
      title: pack.title,
      quantity,
      subtotal: minorString(lineMinor),
      tax: "0",
      total: minorString(lineMinor),
    });
  }

  return { lineItems, totalMinor, grantUsd };
}

function parseSessionRow(row: {
  id: string;
  status: string;
  itemsJson: string;
  buyerJson: string;
  totalMinor: number;
  currency: string;
  orderId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AcpSessionRecord {
  return {
    id: row.id,
    status: row.status as AcpSessionStatus,
    items: JSON.parse(row.itemsJson) as AcpLineItemInput[],
    buyer: JSON.parse(row.buyerJson) as AcpBuyerInput,
    totalMinor: row.totalMinor,
    currency: row.currency,
    orderId: row.orderId,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function persistSession(
  session: AcpSessionRecord,
): Promise<AcpSessionRecord> {
  memorySessions.set(session.id, session);

  if (!dbAvailable()) {
    return session;
  }

  try {
    const prisma = getPrismaClient();
    await prisma.acpSession.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        status: session.status,
        itemsJson: JSON.stringify(session.items),
        buyerJson: JSON.stringify(session.buyer),
        totalMinor: session.totalMinor,
        currency: session.currency,
        orderId: session.orderId,
        idempotencyKey: session.idempotencyKey,
      },
      update: {
        status: session.status,
        itemsJson: JSON.stringify(session.items),
        buyerJson: JSON.stringify(session.buyer),
        totalMinor: session.totalMinor,
        currency: session.currency,
        orderId: session.orderId,
        idempotencyKey: session.idempotencyKey,
      },
    });
  } catch {
    // memory fallback already updated
  }

  return session;
}

export async function getAcpSession(
  id: string,
): Promise<AcpSessionRecord | null> {
  const mem = memorySessions.get(id);
  if (mem) {
    return mem;
  }

  if (!dbAvailable()) {
    return null;
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.acpSession.findUnique({ where: { id } });
    if (!row) {
      return null;
    }
    const session = parseSessionRow(row);
    memorySessions.set(id, session);
    return session;
  } catch {
    return null;
  }
}

async function findSessionByIdempotencyKey(
  key: string,
): Promise<AcpSessionRecord | null> {
  const cached = idempotencyResponses.get(key);
  if (cached) {
    return getAcpSession(cached.sessionId);
  }

  if (!dbAvailable()) {
    for (const session of memorySessions.values()) {
      if (session.idempotencyKey === key) {
        return session;
      }
    }
    return null;
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.acpSession.findUnique({
      where: { idempotencyKey: key },
    });
    if (!row) {
      return null;
    }
    const session = parseSessionRow(row);
    memorySessions.set(session.id, session);
    return session;
  } catch {
    return null;
  }
}

export function buildCheckoutSessionBody(
  session: AcpSessionRecord,
): Record<string, unknown> {
  const { lineItems } = resolveLineItems(session.items);

  return {
    id: session.id,
    object: "checkout.session",
    status: session.status,
    currency: session.currency,
    buyer: session.buyer,
    payment_provider: {
      provider: "stripe",
      supported_payment_methods: ["card"],
    },
    line_items: lineItems,
    fulfillment_options: [
      {
        type: "digital",
        id: "digital",
        title: "Instant credit grant",
        subtotal: "0",
        tax: "0",
        total: "0",
      },
    ],
    totals: [
      { type: "subtotal", amount: minorString(session.totalMinor) },
      { type: "tax", amount: "0" },
      { type: "total", amount: minorString(session.totalMinor) },
    ],
    links: [
      { rel: "terms_of_service", href: TOS_URL },
      { rel: "privacy_policy", href: PRIVACY_URL },
    ],
    ...(session.orderId
      ? {
          order: {
            id: session.orderId,
            checkout_session_id: session.id,
            permalink_url: `https://ailerix.com/orders/${session.orderId}`,
          },
        }
      : {}),
  };
}

export function acpResponseHeaders(
  request: Request,
  extra?: Record<string, string>,
): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  const idempotency = request.headers.get("Idempotency-Key");
  if (idempotency) {
    headers["Idempotency-Key"] = idempotency;
  }
  const requestId =
    request.headers.get("Request-Id") ??
    request.headers.get("X-Request-Id") ??
    randomUUID();
  headers["Request-Id"] = requestId;
  return headers;
}

export function verifyAcpRequestSignature(
  request: Request,
  rawBody: string,
): boolean {
  const secret = process.env.ACP_SIGNING_KEY;
  if (!secret) {
    return true;
  }
  const signature =
    request.headers.get("Signature") ?? request.headers.get("signature");
  if (!signature) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const normalized = signature.replace(/^sha256=/i, "").trim();
  return normalized === expected;
}

export async function createCheckoutSession(input: {
  line_items: AcpLineItemInput[];
  buyer?: AcpBuyerInput;
  idempotencyKey?: string | null;
}): Promise<AcpSessionRecord> {
  if (input.idempotencyKey) {
    const existing = await findSessionByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return existing;
    }
  }

  const { totalMinor } = resolveLineItems(input.line_items);
  const now = new Date();
  const buyer = input.buyer ?? {};

  if (dbAvailable()) {
    try {
      const prisma = getPrismaClient();
      const row = await prisma.acpSession.create({
        data: {
          status: "ready_for_payment",
          itemsJson: JSON.stringify(input.line_items),
          buyerJson: JSON.stringify(buyer),
          totalMinor,
          currency: "usd",
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      const session = parseSessionRow(row);
      memorySessions.set(session.id, session);
      if (input.idempotencyKey) {
        idempotencyResponses.set(input.idempotencyKey, {
          status: 201,
          body: buildCheckoutSessionBody(session),
          sessionId: session.id,
        });
      }
      return session;
    } catch {
      // fall through to memory id
    }
  }

  const session: AcpSessionRecord = {
    id: `cm${randomUUID().replace(/-/g, "")}`,
    status: "ready_for_payment",
    items: input.line_items,
    buyer,
    totalMinor,
    currency: "usd",
    orderId: null,
    idempotencyKey: input.idempotencyKey ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await persistSession(session);

  if (input.idempotencyKey) {
    idempotencyResponses.set(input.idempotencyKey, {
      status: 201,
      body: buildCheckoutSessionBody(session),
      sessionId: session.id,
    });
  }

  return session;
}

export async function updateCheckoutSession(
  id: string,
  patch: { line_items?: AcpLineItemInput[]; buyer?: AcpBuyerInput },
): Promise<AcpSessionRecord> {
  const session = await getAcpSession(id);
  if (!session) {
    throw new Error("not_found");
  }
  if (session.status === "completed") {
    throw new Error("completed");
  }
  if (session.status === "canceled") {
    throw new Error("canceled");
  }

  const items = patch.line_items ?? session.items;
  const buyer = patch.buyer ? { ...session.buyer, ...patch.buyer } : session.buyer;
  const { totalMinor } = resolveLineItems(items);

  const updated: AcpSessionRecord = {
    ...session,
    items,
    buyer,
    totalMinor,
    updatedAt: new Date(),
  };

  return persistSession(updated);
}

export async function cancelCheckoutSession(
  id: string,
): Promise<AcpSessionRecord> {
  const session = await getAcpSession(id);
  if (!session) {
    throw new Error("not_found");
  }
  if (session.status === "completed") {
    throw new Error("completed");
  }

  const updated: AcpSessionRecord = {
    ...session,
    status: "canceled",
    updatedAt: new Date(),
  };

  return persistSession(updated);
}

export type StripePaymentClient = {
  paymentIntents: {
    create: (
      params: Record<string, unknown>,
      options?: { apiVersion?: string },
    ) => Promise<{ id: string }>;
  };
};

export async function chargeWithSharedPaymentToken(input: {
  amount: number;
  currency: string;
  token: string;
  stripe: StripePaymentClient;
}): Promise<{ paymentIntentId: string }> {
  const intent = await input.stripe.paymentIntents.create(
    {
      amount: input.amount,
      currency: input.currency,
      confirm: true,
      shared_payment_granted_token: input.token,
    } as Record<string, unknown>,
    { apiVersion: "2026-04-22.preview" },
  );
  return { paymentIntentId: intent.id };
}

export function extractSharedPaymentToken(
  paymentData: unknown,
): string | null {
  if (!paymentData || typeof paymentData !== "object") {
    return null;
  }
  const data = paymentData as Record<string, unknown>;
  if (typeof data.token === "string" && data.token.length > 0) {
    return data.token;
  }
  if (typeof data.shared_payment_granted_token === "string") {
    return data.shared_payment_granted_token;
  }
  const handler = data.payment_method;
  if (handler && typeof handler === "object") {
    const nested = handler as Record<string, unknown>;
    if (typeof nested.token === "string") {
      return nested.token;
    }
  }
  return null;
}

function fireOrderWebhooks(order: {
  id: string;
  checkout_session_id: string;
  status: string;
}): void {
  const url = process.env.ACP_ORDER_WEBHOOK_URL;
  if (!url) {
    return;
  }

  const secret = process.env.ACP_WEBHOOK_SECRET;
  const post = (type: string, status: string) => {
    const payload = {
      type,
      order: { ...order, status },
    };
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secret) {
      headers["X-Ailerix-Webhook-Signature"] = createHmac("sha256", secret)
        .update(body, "utf8")
        .digest("hex");
    }
    void fetch(url, { method: "POST", headers, body }).catch(() => {});
  };

  post("order_created", "created");
  post("order_updated", "fulfilled");
}

export async function completeCheckoutSession(input: {
  sessionId: string;
  paymentData: unknown;
  stripeClient?: StripePaymentClient | null;
}): Promise<
  | { ok: true; session: AcpSessionRecord; body: Record<string, unknown> }
  | { ok: false; body: Record<string, unknown> }
> {
  const session = await getAcpSession(input.sessionId);
  if (!session) {
    throw new Error("not_found");
  }
  if (session.status === "completed") {
    return {
      ok: true,
      session,
      body: buildCheckoutSessionBody(session),
    };
  }
  if (session.status === "canceled") {
    return {
      ok: false,
      body: {
        messages: [
          {
            type: "error",
            code: "session_canceled",
            message: "Checkout session was canceled.",
          },
        ],
      },
    };
  }

  const token = extractSharedPaymentToken(input.paymentData);
  if (!token) {
    return {
      ok: false,
      body: {
        messages: [
          {
            type: "error",
            code: "invalid_payment_data",
            message: "Missing shared payment token.",
          },
        ],
      },
    };
  }

  if (!stripeEnabled()) {
    return {
      ok: false,
      body: {
        messages: [
          {
            type: "error",
            code: "payment_declined",
            message: "Payment processing is not configured.",
          },
        ],
      },
    };
  }

  const stripe: StripePaymentClient =
    input.stripeClient ??
    (await import("@/lib/stripe").then(
      (m) => m.getStripe() as unknown as StripePaymentClient,
    ));

  try {
    await chargeWithSharedPaymentToken({
      amount: session.totalMinor,
      currency: session.currency,
      token,
      stripe,
    });
  } catch {
    return {
      ok: false,
      body: {
        messages: [
          {
            type: "error",
            code: "payment_declined",
            message: "Payment could not be confirmed.",
          },
        ],
      },
    };
  }

  const email = session.buyer.email?.trim();
  if (!email) {
    return {
      ok: false,
      body: {
        messages: [
          {
            type: "error",
            code: "buyer_required",
            message: "Buyer email is required to grant credits.",
          },
        ],
      },
    };
  }

  const account = await ensureAccountByEmail(email);
  if (!account) {
    return {
      ok: false,
      body: {
        messages: [
          {
            type: "error",
            code: "account_error",
            message: "Could not provision account for buyer.",
          },
        ],
      },
    };
  }

  const { grantUsd } = resolveLineItems(session.items);
  const orderId = `ord_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  await grantCredits({
    accountId: account.id,
    usd: grantUsd,
    reason: "acp_order",
    ref: orderId,
  });

  const completed: AcpSessionRecord = {
    ...session,
    status: "completed",
    orderId,
    updatedAt: new Date(),
  };
  await persistSession(completed);

  fireOrderWebhooks({
    id: orderId,
    checkout_session_id: completed.id,
    status: "fulfilled",
  });

  const body = {
    ...buildCheckoutSessionBody(completed),
    status: "completed" as const,
    order: {
      id: orderId,
      checkout_session_id: completed.id,
      permalink_url: `https://ailerix.com/orders/${orderId}`,
    },
  };

  return { ok: true, session: completed, body };
}

export function getIdempotentCreateResponse(
  key: string,
): { status: number; body: unknown } | null {
  const hit = idempotencyResponses.get(key);
  if (!hit) {
    return null;
  }
  return { status: hit.status, body: hit.body };
}

/** Test-only: reset in-memory ACP session state. */
export function _resetAcpMemoryForTests(): void {
  memorySessions.clear();
  idempotencyResponses.clear();
}
