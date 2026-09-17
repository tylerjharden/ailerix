import { describe, expect, it, vi } from "vitest";

import { echoAdapter } from "@/lib/providers/echo";
import { parseOpenAiSseStream } from "@/lib/providers/openai-compat";
import { bindingFor, isExecutable } from "@/lib/providers/registry";

describe("bindingFor", () => {
  const cases: Array<{ slug: string; apiKeyEnv: string | null }> = [
    { slug: "openai/gpt-5.6-terra", apiKeyEnv: "OPENAI_API_KEY" },
    { slug: "deepseek/deepseek-v4", apiKeyEnv: "DEEPSEEK_API_KEY" },
    { slug: "x-ai/grok-4", apiKeyEnv: "XAI_API_KEY" },
    { slug: "qwen/qwen3-coder", apiKeyEnv: "DASHSCOPE_API_KEY" },
    { slug: "anthropic/claude-fable-5.1", apiKeyEnv: "ANTHROPIC_API_KEY" },
    { slug: "google/gemini-2.5-pro", apiKeyEnv: "GOOGLE_API_KEY" },
    { slug: "ailerix/echo-local", apiKeyEnv: null },
  ];

  for (const { slug, apiKeyEnv } of cases) {
    it(`maps ${slug}`, () => {
      const binding = bindingFor(slug);
      expect(binding).not.toBeNull();
      expect(binding?.apiKeyEnv).toBe(apiKeyEnv);
      expect(binding?.adapter).toBeDefined();
    });
  }

  it("returns null for unknown slug", () => {
    expect(bindingFor("unknown/vendor-model")).toBeNull();
  });
});

describe("isExecutable", () => {
  it("ailerix/echo-local is executable with no env", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(isExecutable("ailerix/echo-local")).toBe(true);
  });

  it("openai slug is false when OPENAI_API_KEY is missing", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(isExecutable("openai/gpt-5.6-terra")).toBe(false);
  });

  it("openai slug is true when OPENAI_API_KEY is set", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(isExecutable("openai/gpt-5.6-terra")).toBe(true);
  });
});

describe("echoAdapter", () => {
  it("completes deterministically", async () => {
    const result = await echoAdapter.complete({
      providerModelId: "echo-local",
      stream: false,
      messages: [{ role: "user", content: "hello world" }],
    });
    expect(result.content).toBe("[echo-local] hello world");
    expect(result.finish_reason).toBe("stop");
    expect(result.usage).toEqual({
      prompt_tokens: Math.ceil("hello world".length / 4),
      completion_tokens: Math.ceil("[echo-local] hello world".length / 4),
    });
  });

  it("streams deterministically with 3 deltas and done", async () => {
    const events = [];
    for await (const event of echoAdapter.stream({
      providerModelId: "echo-local",
      stream: true,
      messages: [{ role: "user", content: "abc" }],
    })) {
      events.push(event);
    }
    const deltas = events.filter((e) => e.type === "delta");
    const done = events.find((e) => e.type === "done");
    expect(deltas.length).toBe(3);
    expect(deltas.map((d) => d.content).join("")).toBe("[echo-local] abc");
    expect(done?.type).toBe("done");
    expect(done && done.type === "done" ? done.finish_reason : "").toBe("stop");
  });
});

describe("parseOpenAiSseStream", () => {
  it("parses synthetic OpenAI-compatible SSE frames", async () => {
    const frames = [
      'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":null}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n',
      "data: [DONE]\n",
    ].join("");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frames));
        controller.close();
      },
    });

    const events = [];
    for await (const event of parseOpenAiSseStream(stream)) {
      events.push(event);
    }

    const deltas = events.filter((e) => e.type === "delta");
    expect(deltas.map((d) => d.content).join("")).toBe("Hello");
    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({
      type: "done",
      finish_reason: "stop",
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });
  });
});
