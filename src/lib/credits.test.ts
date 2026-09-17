import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _resetApiKeysMemoryForTests,
  createKey,
  revokeKey,
  verifyKey,
} from "@/lib/api-keys";
import {
  ANON_DAILY_CAP,
  _resetCreditsMemoryForTests,
  debitCredits,
  ensureAccount,
  getBalance,
  incrementAnonymousUsage,
  insufficientCreditsForExecution,
  usageDebitUsd,
  SIGNUP_GRANT_USD,
} from "@/lib/credits";
import { apiError } from "@/lib/api-error";

describe("credits (memory)", () => {
  afterEach(() => {
    _resetCreditsMemoryForTests();
    _resetApiKeysMemoryForTests();
    vi.unstubAllEnvs();
  });

  it("ensureAccount grants signup balance once", async () => {
    const account = await ensureAccount("user_test_1", "a@b.com");
    expect(account).not.toBeNull();
    const balance = await getBalance(account!.id);
    expect(balance).toBe(SIGNUP_GRANT_USD);
  });

  it("debitCredits reduces balance", async () => {
    const account = await ensureAccount("user_test_2");
    await debitCredits({
      accountId: account!.id,
      usd: 0.25,
      reason: "usage_debit",
      ref: "gen_test",
    });
    const balance = await getBalance(account!.id);
    expect(balance).toBeCloseTo(SIGNUP_GRANT_USD - 0.25, 5);
  });

  it("usageDebitUsd applies 10% markup", () => {
    expect(usageDebitUsd(1)).toBeCloseTo(1.1, 5);
    expect(usageDebitUsd(0)).toBe(0);
    expect(usageDebitUsd(null)).toBe(0);
  });

  it("anonymous usage caps at 25 per day", async () => {
    vi.stubEnv("AILERIX_ENFORCE_ANON_CAP", "1");
    const anonId = "anon_test_id";
    let last = { count: 0, overLimit: false };
    for (let i = 0; i < ANON_DAILY_CAP; i += 1) {
      last = await incrementAnonymousUsage(anonId);
      expect(last.overLimit).toBe(false);
    }
    last = await incrementAnonymousUsage(anonId);
    expect(last.count).toBe(ANON_DAILY_CAP + 1);
    expect(last.overLimit).toBe(true);
  });

  it("insufficientCreditsForExecution allows echo-local at zero balance", async () => {
    const account = await ensureAccount("user_test_3");
    await debitCredits({
      accountId: account!.id,
      usd: SIGNUP_GRANT_USD,
      reason: "usage_debit",
      ref: "gen_drain",
    });
    const blocked = await insufficientCreditsForExecution(
      account!.id,
      "echo-local",
      0,
    );
    expect(blocked).toBe(false);
  });

  it("insufficientCreditsForExecution blocks paid routes at zero balance", async () => {
    const account = await ensureAccount("user_test_4");
    await debitCredits({
      accountId: account!.id,
      usd: SIGNUP_GRANT_USD,
      reason: "usage_debit",
      ref: "gen_drain2",
    });
    const blocked = await insufficientCreditsForExecution(
      account!.id,
      "gpt-5-6-terra",
      4.9,
    );
    expect(blocked).toBe(true);
  });
});

describe("api keys (memory)", () => {
  afterEach(() => {
    _resetCreditsMemoryForTests();
    _resetApiKeysMemoryForTests();
  });

  it("create, verify, and revoke roundtrip", async () => {
    const account = await ensureAccount("user_key_1");
    const created = await createKey(account!.id, "Test key");
    expect(created?.key.startsWith("ailerix_")).toBe(true);

    const verified = await verifyKey(created!.key);
    expect(verified?.accountId).toBe(account!.id);

    await revokeKey(account!.id, created!.id);
    expect(await verifyKey(created!.key)).toBeNull();
  });
});

describe("error envelopes", () => {
  it("402 payment_required shape", async () => {
    const response = apiError({
      status: 402,
      message: "Insufficient credits. Top up your balance to continue.",
      code: "insufficient_credits",
      errorType: "payment_required",
    });
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        message: "Insufficient credits. Top up your balance to continue.",
        type: "invalid_request_error",
        code: "insufficient_credits",
        metadata: { error_type: "payment_required" },
      },
    });
  });

  it("429 rate_limit_exceeded shape", async () => {
    const response = apiError({
      status: 429,
      message: "Anonymous daily request limit exceeded (25 per day).",
      code: "rate_limit_exceeded",
      errorType: "rate_limit_exceeded",
    });
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        message: "Anonymous daily request limit exceeded (25 per day).",
        type: "invalid_request_error",
        code: "rate_limit_exceeded",
        metadata: { error_type: "rate_limit_exceeded" },
      },
    });
  });
});
