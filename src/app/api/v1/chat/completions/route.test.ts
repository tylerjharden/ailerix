import { describe, expect, it } from "vitest";
import { TASK_FAMILIES } from "@/lib/families";
import { POST as postChatCompletions } from "./route";
import { POST as postRoute } from "../../route/route";
import { GET as getModels } from "../../models/route";

const PROVIDER_PREFIXES = [
  "openai/",
  "anthropic/",
  "google/",
  "deepseek/",
  "qwen/",
  "meta-llama/",
  "mistral/",
  "x-ai/",
];

function assertNoProviderSlugs(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const prefix of PROVIDER_PREFIXES) {
    expect(serialized).not.toContain(prefix);
  }
}

const userMessage = {
  messages: [{ role: "user" as const, content: "Summarize this refund ticket." }],
};

describe("POST /api/v1/chat/completions", () => {
  it("rejects disallowed model slugs", async () => {
    const models = [
      "openai/gpt-5.4",
      "openrouter/auto",
      "openrouter/free",
      "anthropic/claude-sonnet-4.6:nitro",
    ];
    for (const model of models) {
      const response = await postChatCompletions(
        new Request("http://localhost/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...userMessage, model }),
        }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error?.code).toBe("model_not_allowed");
    }
  });

  it("rejects forbidden parameters", async () => {
    for (const field of ["models", "provider"] as const) {
      const payload =
        field === "models"
          ? { ...userMessage, models: [] }
          : { ...userMessage, provider: {} };
      const response = await postChatCompletions(
        new Request("http://localhost/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error?.code).toBe("parameter_not_allowed");
      expect(body.error?.message).toContain(field);
    }
  });

  it("accepts omitted model and ailerix/auto", async () => {
    for (const model of [undefined, "ailerix/auto"] as const) {
      const response = await postChatCompletions(
        new Request("http://localhost/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            model === undefined ? userMessage : { ...userMessage, model },
          ),
        }),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.model).toBe("ailerix/auto");
      assertNoProviderSlugs(body);
    }
  });
});

describe("GET /api/v1/models", () => {
  it("returns only ailerix/auto", async () => {
    const response = await getModels();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe("ailerix/auto");
    assertNoProviderSlugs(body);
  });
});

describe("POST /api/v1/route", () => {
  it("returns a valid family and public model id", async () => {
    const response = await postRoute(
      new Request("http://localhost/api/v1/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Refactor this TypeScript module for stricter types.",
          policy: "balanced",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.model).toBe("ailerix/auto");
    expect((TASK_FAMILIES as readonly string[]).includes(body.family)).toBe(
      true,
    );
    expect(body.reasons).toBeDefined();
    expect(body.decisions).toBeDefined();
    expect(body.latency_ms).toBeTypeOf("number");
    expect(body.engine).toBeDefined();
    expect(body.policy).toBe("balanced");
    expect(body.output).toBeTypeOf("string");
    assertNoProviderSlugs(body);
  });
});
