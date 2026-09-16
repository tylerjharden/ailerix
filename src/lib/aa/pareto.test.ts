import { describe, expect, it } from "vitest";

import { loadSnapshot } from "@/lib/aa/load";
import {
  buildFrontier,
  familyCost,
  familyQuality,
} from "@/lib/aa/pareto";
import type { AaModelSnapshot } from "@/lib/aa/types";

function stubModel(
  overrides: Partial<AaModelSnapshot> & Pick<AaModelSnapshot, "aa_id">,
): AaModelSnapshot {
  return {
    name: overrides.aa_id,
    creator: "Test",
    openrouter_api_id: overrides.aa_id,
    provider_slug: overrides.aa_id,
    intelligence_index: 50,
    family_scores: {},
    cost_per_task_usd: { intelligence: 1 },
    input_per_mtok_usd: 1,
    output_per_mtok_usd: 1,
    output_tokens_per_sec: 100,
    ttft_ms: 500,
    context_window: 128000,
    capabilities: {
      vision: false,
      tools: true,
      code: true,
      reasoning: false,
    },
    retrieved_at: "2026-01-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildFrontier", () => {
  it("drops a dominated point (higher cost, lower quality)", () => {
    const cheap = stubModel({
      aa_id: "cheap-good",
      intelligence_index: 80,
      cost_per_task_usd: { intelligence: 1 },
    });
    const dominated = stubModel({
      aa_id: "expensive-worse",
      intelligence_index: 60,
      cost_per_task_usd: { intelligence: 2 },
    });

    const frontier = buildFrontier([cheap, dominated], "intelligence");
    expect(frontier.map((point) => point.aa_id)).toEqual(["cheap-good"]);
  });

  it("at equal cost keeps only the higher-quality model", () => {
    const low = stubModel({
      aa_id: "a-low",
      intelligence_index: 40,
      cost_per_task_usd: { intelligence: 1 },
    });
    const high = stubModel({
      aa_id: "b-high",
      intelligence_index: 70,
      cost_per_task_usd: { intelligence: 1 },
    });

    const frontier = buildFrontier([low, high], "intelligence");
    expect(frontier).toHaveLength(1);
    expect(frontier[0]?.aa_id).toBe("b-high");
    expect(frontier[0]?.quality).toBe(70);
  });

  it("assigns Infinity to the first gradient and positive finite values after", () => {
    const snapshot = loadSnapshot();
    const frontier = buildFrontier(snapshot.models, "intelligence");

    expect(frontier.length).toBeGreaterThan(1);
    expect(frontier[0]?.gradient).toBe(Infinity);

    for (let i = 1; i < frontier.length; i++) {
      const gradient = frontier[i]!.gradient;
      expect(gradient).toBeGreaterThan(0);
      expect(Number.isFinite(gradient)).toBe(true);
    }
  });
});

describe("familyCost", () => {
  it("falls back to intelligence when a family cost is missing", () => {
    const flash = loadSnapshot().models.find(
      (model) => model.aa_id === "gemini-2-5-flash",
    );
    expect(flash).toBeDefined();
    expect(flash!.cost_per_task_usd.coding).toBeUndefined();
    expect(familyCost(flash!, "coding")).toBe(
      flash!.cost_per_task_usd.intelligence,
    );
    expect(familyCost(flash!, "coding")).toBe(0.18);
  });
});

describe("fixture intelligence frontier", () => {
  it("places echo-local first without dominating real models", () => {
    const snapshot = loadSnapshot();
    const frontier = buildFrontier(snapshot.models, "intelligence");

    expect(frontier[0]?.aa_id).toBe("echo-local");
    expect(frontier[0]?.cost_per_task_usd).toBe(0);

    const echoQuality = familyQuality(
      snapshot.models.find((model) => model.aa_id === "echo-local")!,
      "intelligence",
    );
    const realPoints = frontier.filter((point) => point.aa_id !== "echo-local");
    for (const point of realPoints) {
      expect(point.quality).toBeGreaterThan(echoQuality);
    }
  });
});

describe("loadSnapshot", () => {
  it("parses the checked-in fixture", () => {
    const snapshot = loadSnapshot();
    expect(snapshot.license).toBe("missing");
    expect(snapshot.version).toBe("4.3-fixture");
    expect(snapshot.models).toHaveLength(10);
  });
});
