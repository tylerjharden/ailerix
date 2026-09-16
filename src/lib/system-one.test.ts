import { describe, expect, it } from "vitest";
import { TASK_FAMILIES, isTaskFamily } from "@/lib/families";
import {
  evaluateLocal,
  routingQuestions,
  type Answer,
} from "@/lib/system-one";

const ROUTING_IDS = [
  "task_family",
  "quality_floor",
  "cost_sensitivity",
  "latency_sensitivity",
  "needs_vision",
  "needs_tools",
  "is_code",
  "hallucination_sensitive",
  "needs_long_context",
] as const;

function evaluateBalanced(state: string) {
  return evaluateLocal({
    state,
    model: "jev-latest",
    questions: routingQuestions("balanced"),
  });
}

function assertConfidences(answers: Record<string, Answer>) {
  for (const answer of Object.values(answers)) {
    expect(answer.confidence).toBeGreaterThanOrEqual(0);
    expect(answer.confidence).toBeLessThanOrEqual(1);
  }
}

describe("evaluateLocal routingQuestions (balanced)", () => {
  it("answers all WP-1 question ids with correct types", () => {
    const result = evaluateBalanced("Summarize this article in two bullets.");
    for (const id of ROUTING_IDS) {
      expect(result.answers[id]).toBeDefined();
    }
    expect(result.answers.task_family.type).toBe("choice");
    expect(result.answers.quality_floor.type).toBe("score");
    expect(result.answers.cost_sensitivity.type).toBe("score");
    expect(result.answers.latency_sensitivity.type).toBe("score");
    expect(result.answers.needs_vision.type).toBe("noul");
    expect(result.answers.needs_tools.type).toBe("noul");
    expect(result.answers.is_code.type).toBe("noul");
    expect(result.answers.hallucination_sensitive.type).toBe("noul");
    expect(result.answers.needs_long_context.type).toBe("noul");
    assertConfidences(result.answers);
  });

  it("classifies refund/payroll as intelligence or professional, not coding", () => {
    const result = evaluateBalanced(
      "refund this double charge before payroll",
    );
    const family = result.answers.task_family;
    expect(family.type).toBe("choice");
    if (family.type === "choice") {
      expect(["intelligence", "professional"]).toContain(family.choice);
      expect(family.choice).not.toBe("coding");
    }
  });

  it("detects coding from stack trace and function", () => {
    const prompt = `Error in production:
    at handler (index.ts:12)
    stack trace follows
    function processPayment() { throw new Error("fail"); }`;
    const result = evaluateBalanced(prompt);
    const family = result.answers.task_family;
    expect(family.type).toBe("choice");
    if (family.type === "choice") {
      expect(family.choice).toBe("coding");
    }
    const isCode = result.answers.is_code;
    expect(isCode.type).toBe("noul");
    if (isCode.type === "noul") {
      expect(isCode.noul).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("detects vision screenshot prompts", () => {
    const result = evaluateBalanced("what's in this screenshot?");
    const family = result.answers.task_family;
    expect(family.type).toBe("choice");
    if (family.type === "choice") {
      expect(family.choice).toBe("vision");
    }
    const vision = result.answers.needs_vision;
    expect(vision.type).toBe("noul");
    if (vision.type === "noul") {
      expect(vision.noul).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("flags long context for very long prompts", () => {
    const longPrompt = "x".repeat(8000);
    const result = evaluateBalanced(longPrompt);
    const longCtx = result.answers.needs_long_context;
    expect(longCtx.type).toBe("noul");
    if (longCtx.type === "noul") {
      expect(longCtx.noul).toBeGreaterThanOrEqual(0.7);
    }
    const family = result.answers.task_family;
    if (family.type === "choice") {
      expect(family.choice).toBe("long_context");
    }
  });

  it("raises hallucination sensitivity for citation/fact prompts", () => {
    const result = evaluateBalanced(
      "cite sources: when did the fed last cut rates",
    );
    const hall = result.answers.hallucination_sensitive;
    expect(hall.type).toBe("noul");
    if (hall.type === "noul") {
      expect(hall.noul).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("routingQuestions(cheap) JSON has no provider prefixes", () => {
    const forbidden = [
      "openai/",
      "anthropic/",
      "google/",
      "deepseek/",
      "qwen/",
      "meta-llama/",
      "mistral/",
      "x-ai/",
      "ailerix/echo",
    ];
    const serialized = JSON.stringify(routingQuestions("cheap"));
    for (const prefix of forbidden) {
      expect(serialized.includes(prefix)).toBe(false);
    }
  });

  it("task_family choices are always valid families", () => {
    const prompts = [
      "Write a poem about autumn.",
      "Fix this React hook dependency warning.",
      "Search the web and book a flight to Denver.",
    ];
    for (const prompt of prompts) {
      const result = evaluateBalanced(prompt);
      const family = result.answers.task_family;
      if (family.type === "choice") {
        expect(isTaskFamily(family.choice)).toBe(true);
        expect(TASK_FAMILIES).toContain(family.choice);
      }
    }
  });
});
