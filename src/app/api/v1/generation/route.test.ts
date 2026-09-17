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
    fallbackAaId: "gemini-2-5-flash",
    nextUpUsed: false,
    degraded: false,
    executed: true,
    status: "ok",
    jevMs: 10,
    walkMs: 5,
    providerTtftMs: 20,
    providerTotalMs: 100,
    totalMs: 120,
    promptTokens: 100,
    completionTokens: 50,
    reasoningTokens: null,
    costPerTaskUsd: 0,
    estimatedTurnUsd: 0.001,
    ...overrides,
  };
}

describe("GET /api/v1/generation", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 400 when id is missing", async () => {
    const { GET: getGeneration } = await import("./route");
    const response = await getGeneration(
      new Request("http://localhost/api/v1/generation"),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error?.code).toBe("invalid_request");
    expect(body.error?.metadata?.error_type).toBe("invalid_request");
    expect(body.error?.type).toBe("invalid_request_error");
  });

  it("returns 404 for unknown generation id", async () => {
    const { GET: getGeneration } = await import("./route");
    const response = await getGeneration(
      new Request("http://localhost/api/v1/generation?id=gen_does_not_exist"),
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error?.code).toBe("not_found");
    expect(body.error?.metadata?.error_type).toBe("not_found");
  });

  it("returns public generation data without provider slug", async () => {
    const { recordEvent } = await import("@/lib/analytics/store");
    const generationId = "gen_lookup_test_e5";
    await recordEvent(sampleInput({ generationId }));

    const { GET: getGeneration } = await import("./route");
    const response = await getGeneration(
      new Request(`http://localhost/api/v1/generation?id=${generationId}`),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data?.id).toBe(generationId);
    expect(body.data?.aa_id).toBe("echo-local");
    expect(body.data?.latency?.total_ms).toBe(120);
    expect(body.data?.cost?.estimated_turn_usd).toBe(0.001);
    expect(JSON.stringify(body)).not.toContain("providerSlug");
    expect(JSON.stringify(body)).not.toContain("ailerix/echo-local");
  });

  it("completions 400 errors include metadata.error_type", async () => {
    const { POST: postChatCompletions } = await import("../chat/completions/route");
    const modelResponse = await postChatCompletions(
      new Request("http://localhost/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          model: "openai/gpt-5.4",
        }),
      }),
    );
    const modelBody = await modelResponse.json();
    expect(modelBody.error?.metadata?.error_type).toBe("model_not_allowed");

    const paramResponse = await postChatCompletions(
      new Request("http://localhost/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          provider: {},
        }),
      }),
    );
    const paramBody = await paramResponse.json();
    expect(paramBody.error?.metadata?.error_type).toBe("parameter_not_allowed");
  });
});
