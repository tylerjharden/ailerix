import { afterEach, describe, expect, it, vi } from "vitest";

import { loadSnapshot } from "@/lib/aa/load";
import { echoAdapter } from "@/lib/providers/echo";
import * as registry from "@/lib/providers/registry";
import { ProviderError } from "@/lib/providers/types";
import type { RouteDecision } from "@/lib/router";
import {
  estimatedTurnUsd,
  executeRoute,
  ProviderUnavailableError,
} from "@/lib/execute";

function baseDecision(overrides: Partial<RouteDecision> = {}): RouteDecision {
  return {
    family: "intelligence",
    familyConfidence: 0.9,
    aaId: "echo-local",
    providerSlug: "ailerix/echo-local",
    providerModelId: "echo-local",
    costPerTaskUsd: 0,
    floor: 1,
    fallbackAaId: "echo-local",
    fallbackProviderSlug: "ailerix/echo-local",
    fallbackProviderModelId: "echo-local",
    nextUpUsed: false,
    degraded: false,
    policy: "balanced",
    engine: "ailerix-local",
    latency_ms: 10,
    jevMs: 5,
    walkMs: 3,
    reasons: ["test"],
    decisions: {
      model: "jev-latest",
      engine: "ailerix-local",
      latency_ms: 1,
      answers: {
        task_family: {
          type: "choice",
          choice: "intelligence",
          confidence: 0.9,
          probabilities: { intelligence: 1 },
        },
        quality_floor: {
          type: "score",
          score: 1,
          confidence: 0.9,
          legend: [],
          probabilities: [1],
        },
        cost_sensitivity: {
          type: "score",
          score: 1,
          confidence: 0.9,
          legend: [],
          probabilities: [1],
        },
        latency_sensitivity: {
          type: "score",
          score: 1,
          confidence: 0.9,
          legend: [],
          probabilities: [1],
        },
        needs_vision: { type: "noul", noul: 0.1, confidence: 0.9 },
        needs_tools: { type: "noul", noul: 0.1, confidence: 0.9 },
        is_code: { type: "noul", noul: 0.1, confidence: 0.9 },
        hallucination_sensitive: { type: "noul", noul: 0.1, confidence: 0.9 },
        needs_long_context: { type: "noul", noul: 0.1, confidence: 0.9 },
      },
    },
    ...overrides,
  };
}

const failingAdapter = {
  complete: async () => {
    throw new ProviderError("fail", "http_error", 500);
  },
  stream: async function* () {
    throw new ProviderError("fail", "http_error", 500);
    yield { type: "done" as const, finish_reason: "stop", usage: null };
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("executeRoute (echo)", () => {
  it("non-stream returns echo content and usage", async () => {
    const result = await executeRoute({
      decision: baseDecision(),
      messages: [{ role: "user", content: "hello there" }],
      stream: false,
      params: {},
    });

    expect(result.kind).toBe("json");
    if (result.kind !== "json") return;

    expect(result.content).toBe("[echo-local] hello there");
    expect(result.usage?.prompt_tokens).toBeGreaterThan(0);
    expect(result.executedAaId).toBe("echo-local");
    expect(result.fallbackUsed).toBe(false);
  });

  it("stream yields deltas then done", async () => {
    const result = await executeRoute({
      decision: baseDecision(),
      messages: [{ role: "user", content: "stream me" }],
      stream: true,
      params: {},
    });

    expect(result.kind).toBe("stream");
    if (result.kind !== "stream") return;

    const deltas: string[] = [];
    let sawDone = false;
    for await (const event of result.events) {
      if (event.type === "delta") deltas.push(event.content);
      if (event.type === "done") sawDone = true;
    }
    const done = await result.onDone;

    expect(deltas.join("")).toBe("[echo-local] stream me");
    expect(sawDone).toBe(true);
    expect(done.fallbackUsed).toBe(false);
  });
});

describe("executeRoute fallback", () => {
  it("uses fallback when pick throws ProviderError", async () => {
    vi.spyOn(registry, "bindingFor").mockImplementation((slug: string) => {
      if (slug === "openai/gpt-fail") {
        return { adapter: failingAdapter, apiKeyEnv: "OPENAI_API_KEY" };
      }
      if (slug.startsWith("ailerix/")) {
        return { adapter: echoAdapter, apiKeyEnv: null };
      }
      return null;
    });

    const result = await executeRoute({
      decision: baseDecision({
        aaId: "gpt-5-mini",
        providerSlug: "openai/gpt-fail",
        providerModelId: "gpt-fail",
        fallbackAaId: "echo-local",
        fallbackProviderSlug: "ailerix/echo-local",
        fallbackProviderModelId: "echo-local",
      }),
      messages: [{ role: "user", content: "fallback please" }],
      stream: false,
      params: {},
    });

    expect(result.kind).toBe("json");
    if (result.kind !== "json") return;
    expect(result.fallbackUsed).toBe(true);
    expect(result.content).toContain("[echo-local]");
  });

  it("throws provider_unavailable when both fail", async () => {
    vi.spyOn(registry, "bindingFor").mockImplementation(() => ({
      adapter: failingAdapter,
      apiKeyEnv: "OPENAI_API_KEY",
    }));

    await expect(
      executeRoute({
        decision: baseDecision({
          providerSlug: "openai/gpt-fail",
          providerModelId: "gpt-fail",
          fallbackProviderSlug: "openai/gpt-fail-2",
          fallbackProviderModelId: "gpt-fail-2",
        }),
        messages: [{ role: "user", content: "nope" }],
        stream: false,
        params: {},
      }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe("estimatedTurnUsd", () => {
  it("computes from snapshot token prices", () => {
    const model = loadSnapshot().models.find((m) => m.aa_id === "gpt-5-mini");
    expect(model).toBeDefined();
    if (!model) return;

    const usd = estimatedTurnUsd(model, {
      prompt_tokens: 1_000_000,
      completion_tokens: 0,
    });
    expect(usd).toBeCloseTo(model.input_per_mtok_usd, 5);
  });
});
