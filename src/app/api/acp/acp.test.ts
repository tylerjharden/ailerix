import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetAcpMemoryForTests,
  chargeWithSharedPaymentToken,
  completeCheckoutSession,
  createCheckoutSession,
  extractSharedPaymentToken,
} from "@/lib/acp";
import {
  _resetCreditsMemoryForTests,
  getBalance,
  SIGNUP_GRANT_USD,
} from "@/lib/credits";

describe("ACP checkout (memory)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    _resetAcpMemoryForTests();
    _resetCreditsMemoryForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetAcpMemoryForTests();
    _resetCreditsMemoryForTests();
  });

  it("create → get → update → complete lifecycle with stripe disabled", async () => {
    const { POST: createPost } = await import("./checkout_sessions/route");
    const createRes = await createPost(
      new Request("http://localhost/api/acp/checkout_sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-lifecycle-1",
          "Request-Id": "req-create-1",
        },
        body: JSON.stringify({
          line_items: [{ item_id: "CREDITS-5", quantity: 1 }],
          buyer: { email: "buyer@example.com" },
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    expect(createRes.headers.get("Idempotency-Key")).toBe("idem-lifecycle-1");
    expect(createRes.headers.get("Request-Id")).toBe("req-create-1");
    const created = (await createRes.json()) as {
      id: string;
      status: string;
      line_items: Array<{ subtotal: string; total: string; tax: string }>;
      totals: Array<{ type: string; amount: string }>;
      payment_provider: { provider: string };
    };
    expect(created.status).toBe("ready_for_payment");
    expect(created.payment_provider.provider).toBe("stripe");
    expect(created.line_items[0]?.subtotal).toBe("500");
    expect(created.line_items[0]?.tax).toBe("0");
    expect(created.totals.find((t) => t.type === "total")?.amount).toBe("500");

    const { GET: getSession } = await import("./checkout_sessions/[id]/route");
    const getRes = await getSession(
      new Request(`http://localhost/api/acp/checkout_sessions/${created.id}`),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as { id: string };
    expect(fetched.id).toBe(created.id);

    const { PATCH: patchSession } = await import("./checkout_sessions/[id]/route");
    const patchRes = await patchSession(
      new Request(`http://localhost/api/acp/checkout_sessions/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_items: [{ item_id: "CREDITS-20", quantity: 1 }],
        }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      line_items: Array<{ item_id: string; total: string }>;
    };
    expect(patched.line_items[0]?.item_id).toBe("CREDITS-20");
    expect(patched.line_items[0]?.total).toBe("2000");

    const { POST: completePost } = await import(
      "./checkout_sessions/[id]/complete/route"
    );
    const completeRes = await completePost(
      new Request(
        `http://localhost/api/acp/checkout_sessions/${created.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_data: { token: "spt_test_token" } }),
        },
      ),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(completeRes.status).toBe(402);
    const declined = (await completeRes.json()) as {
      messages: Array<{ code: string }>;
    };
    expect(declined.messages[0]?.code).toBe("payment_declined");
  });

  it("idempotent create returns the same session", async () => {
    const { POST: createPost } = await import("./checkout_sessions/route");
    const headers = {
      "Content-Type": "application/json",
      "Idempotency-Key": "idem-dup-key",
    };
    const body = JSON.stringify({
      line_items: [{ item_id: "CREDITS-5", quantity: 1 }],
    });

    const first = await createPost(
      new Request("http://localhost/api/acp/checkout_sessions", {
        method: "POST",
        headers,
        body,
      }),
    );
    const second = await createPost(
      new Request("http://localhost/api/acp/checkout_sessions", {
        method: "POST",
        headers,
        body,
      }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const a = (await first.json()) as { id: string };
    const b = (await second.json()) as { id: string };
    expect(a.id).toBe(b.id);
  });

  it("cancel after complete returns 405", async () => {
    const session = await createCheckoutSession({
      line_items: [{ item_id: "CREDITS-5", quantity: 1 }],
      buyer: { email: "done@example.com" },
    });

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    const fakeStripe = {
      paymentIntents: {
        create: vi.fn().mockResolvedValue({ id: "pi_test" }),
      },
    };

    const result = await completeCheckoutSession({
      sessionId: session.id,
      paymentData: { token: "spt_ok" },
      stripeClient: fakeStripe,
    });
    expect(result.ok).toBe(true);

    const account = await (
      await import("@/lib/credits")
    ).ensureAccountByEmail("done@example.com");
    const bal = await getBalance(account!.id);
    expect(bal).toBeCloseTo(SIGNUP_GRANT_USD + 5, 5);

    const { POST: cancelPost } = await import(
      "./checkout_sessions/[id]/cancel/route"
    );
    const cancelRes = await cancelPost(
      new Request(
        `http://localhost/api/acp/checkout_sessions/${session.id}/cancel`,
        { method: "POST", body: "{}" },
      ),
      { params: Promise.resolve({ id: session.id }) },
    );
    expect(cancelRes.status).toBe(405);
  });

  it("passes shared_payment_granted_token to Stripe", async () => {
    const session = await createCheckoutSession({
      line_items: [{ item_id: "CREDITS-5", quantity: 1 }],
      buyer: { email: "stripe@example.com" },
    });

    const create = vi.fn().mockResolvedValue({ id: "pi_123" });
    const fakeStripe = { paymentIntents: { create } };

    await chargeWithSharedPaymentToken({
      amount: 500,
      currency: "usd",
      token: "spt_injected",
      stripe: fakeStripe,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500,
        currency: "usd",
        confirm: true,
        shared_payment_granted_token: "spt_injected",
      }),
      { apiVersion: "2026-04-22.preview" },
    );

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    const completed = await completeCheckoutSession({
      sessionId: session.id,
      paymentData: {
        payment_method: { token: "spt_handler_shape" },
      },
      stripeClient: fakeStripe,
    });
    expect(completed.ok).toBe(true);
    expect(create).toHaveBeenCalled();
  });

  it("extractSharedPaymentToken supports flat and handler shapes", () => {
    expect(extractSharedPaymentToken({ token: "a" })).toBe("a");
    expect(
      extractSharedPaymentToken({ payment_method: { token: "b" } }),
    ).toBe("b");
    expect(extractSharedPaymentToken({})).toBeNull();
  });
});
