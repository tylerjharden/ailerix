import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RouteEventInput } from "@/lib/analytics/types";

function sampleInput(overrides: Partial<RouteEventInput> = {}): RouteEventInput {
  return {
    generationId: `gen_${crypto.randomUUID()}`,
    endpoint: "chat.completions",
    policy: "balanced",
    engine: "ailerix-local",
    family: "intelligence",
    familyConfidence: 0.9,
    qualityFloor: 1,
    mappedFloor: 42,
    aaId: "echo-local",
    providerSlug: "ailerix/echo-local",
    fallbackAaId: "echo-local",
    nextUpUsed: false,
    degraded: false,
    executed: true,
    status: "ok",
    jevMs: 10,
    walkMs: 5,
    providerTotalMs: 100,
    totalMs: 120,
    promptTokens: 100,
    completionTokens: 50,
    costPerTaskUsd: 0,
    estimatedTurnUsd: 0.001,
    ...overrides,
  };
}

describe("analytics store (memory)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("recordEvent + getEvent roundtrip", async () => {
    const { recordEvent, getEvent } = await import("@/lib/analytics/store");
    const input = sampleInput({ generationId: "gen_roundtrip_test" });
    await recordEvent(input);
    const found = await getEvent("gen_roundtrip_test");
    expect(found).not.toBeNull();
    expect(found?.generationId).toBe("gen_roundtrip_test");
    expect(found?.family).toBe("intelligence");
    expect(found?.estimatedTurnUsd).toBe(0.001);
  });

  it("ring buffer caps at 500", async () => {
    const { recordEvent, getEvent } = await import("@/lib/analytics/store");
    for (let i = 0; i < 501; i += 1) {
      await recordEvent(
        sampleInput({
          generationId: `gen_ring_${i}`,
          totalMs: i,
        }),
      );
    }
    expect(await getEvent("gen_ring_0")).toBeNull();
    expect(await getEvent("gen_ring_500")).not.toBeNull();
    expect(await getEvent("gen_ring_499")).not.toBeNull();
  });

  it("summarize computes totals, rates, and percentiles on a seeded set", async () => {
    const { recordEvent, summarize } = await import("@/lib/analytics/store");
    await recordEvent(
      sampleInput({
        generationId: "gen_a",
        family: "coding",
        nextUpUsed: true,
        degraded: false,
        executed: true,
        status: "ok",
        jevMs: 10,
        walkMs: 20,
        providerTotalMs: 100,
        totalMs: 200,
        promptTokens: 10,
        completionTokens: 5,
        estimatedTurnUsd: 0.01,
      }),
    );
    await recordEvent(
      sampleInput({
        generationId: "gen_b",
        family: "vision",
        nextUpUsed: false,
        degraded: true,
        executed: false,
        status: "provider_error",
        jevMs: 30,
        walkMs: 40,
        providerTotalMs: 300,
        totalMs: 400,
        promptTokens: 20,
        completionTokens: 10,
        estimatedTurnUsd: 0.02,
      }),
    );

    const summary = await summarize({ days: 7 });
    expect(summary.source).toBe("memory");
    expect(summary.totals.requests).toBe(2);
    expect(summary.totals.spendUsd).toBeCloseTo(0.03, 5);
    expect(summary.totals.promptTokens).toBe(30);
    expect(summary.totals.completionTokens).toBe(15);
    expect(summary.rates.nextUp).toBe(0.5);
    expect(summary.rates.degraded).toBe(0.5);
    expect(summary.rates.providerError).toBe(0.5);
    expect(summary.rates.executed).toBe(0.5);
    expect(summary.latency.jevMsP50).toBe(10);
    expect(summary.latency.walkMsP50).toBe(20);
    expect(summary.latency.providerTotalMsP50).toBe(100);
    expect(summary.latency.totalMsP50).toBe(200);
    expect(summary.latency.totalMsP95).toBe(400);
    expect(summary.byFamily.length).toBe(2);
  });

  it("summarize with zero events returns zeroed shape with source memory", async () => {
    const { summarize } = await import("@/lib/analytics/store");
    const summary = await summarize({ days: 7 });
    expect(summary.source).toBe("memory");
    expect(summary.totals.requests).toBe(0);
    expect(summary.totals.spendUsd).toBe(0);
    expect(summary.byDay).toEqual([]);
    expect(summary.byFamily).toEqual([]);
    expect(summary.rates.nextUp).toBe(0);
    expect(summary.latency.totalMsP95).toBe(0);
  });
});
