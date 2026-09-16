import { describe, expect, it } from "vitest";

import { loadSnapshot } from "@/lib/aa/load";
import { walkFrontier } from "@/lib/aa/walk";
import type { ScoreAnswer } from "@/lib/system-one";

function scoreAnswer(
  score: number,
  confidence = 0.9,
): ScoreAnswer {
  return {
    type: "score",
    score,
    legend: ["0", "1", "2", "3"],
    probabilities: [0.25, 0.25, 0.25, 0.25],
    confidence,
  };
}

function baseInput(
  overrides: Partial<{
    family: "intelligence" | "coding";
    familyConfidence: number;
    qualityFloor: number;
    qualityFloorConfidence: number;
    costSensitivity: number;
    latencySensitivity: number;
    nouls: Partial<{
      vision: number;
      tools: number;
      code: number;
      hallucination: number;
      longContext: number;
    }>;
    requiredContext?: number;
  }> = {},
) {
  const snapshot = loadSnapshot();
  const nouls = {
    vision: 0.1,
    tools: 0.1,
    code: 0.1,
    hallucination: 0.1,
    longContext: 0.1,
    ...overrides.nouls,
  };

  return {
    snapshot,
    family: overrides.family ?? "intelligence",
    familyConfidence: overrides.familyConfidence ?? 0.9,
    scores: {
      qualityFloor: scoreAnswer(
        overrides.qualityFloor ?? 1.0,
        overrides.qualityFloorConfidence ?? 0.9,
      ),
      costSensitivity: scoreAnswer(overrides.costSensitivity ?? 1.5),
      latencySensitivity: scoreAnswer(overrides.latencySensitivity ?? 0.5),
    },
    nouls,
    requiredContext: overrides.requiredContext,
  };
}

describe("walkFrontier", () => {
  it("1: low floor on intelligence picks cheapest clearing 15th-pct floor", () => {
    const result = walkFrontier(
      baseInput({
        family: "intelligence",
        qualityFloor: 0.2,
        costSensitivity: 2.5,
      }),
    );
    expect(["echo-local", "gemini-2-5-flash"]).toContain(result.pick.aa_id);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("2: coding with high code noul requires code capability", () => {
    const result = walkFrontier(
      baseInput({
        family: "coding",
        qualityFloor: 1.0,
        nouls: { code: 0.9, vision: 0.1 },
      }),
    );
    expect(result.pick.capabilities.code).toBe(true);
    expect(result.pick.aa_id).not.toBe("gemini-2-5-flash");
  });

  it("3: high floor score picks frontier tier at or above 85th percentile quality", () => {
    const snapshot = loadSnapshot();
    const eligible = snapshot.models;
    const qualities = eligible
      .map((m) => m.family_scores.intelligence ?? m.intelligence_index)
      .sort((a, b) => a - b);
    const p85 =
      qualities[Math.floor(0.85 * (qualities.length - 1))] ??
      qualities[qualities.length - 1]!;

    const result = walkFrontier(
      baseInput({
        family: "intelligence",
        qualityFloor: 2.8,
        costSensitivity: 2.5,
      }),
    );

    const pickQuality =
      result.pick.family_scores.intelligence ??
      result.pick.intelligence_index;
    expect(pickQuality).toBeGreaterThanOrEqual(p85 - 0.01);
    expect(["gpt-5-6-terra", "claude-fable-5-1"]).toContain(result.pick.aa_id);
  });

  it("4: low family confidence triggers next_up", () => {
    const result = walkFrontier(
      baseInput({
        qualityFloor: 1.0,
        familyConfidence: 0.4,
      }),
    );
    expect(result.next_up_used).toBe(true);
  });

  it("5: low cost sensitivity with moderate floor triggers gradient next_up", () => {
    const result = walkFrontier(
      baseInput({
        qualityFloor: 0.5,
        costSensitivity: 0.2,
        familyConfidence: 0.9,
        qualityFloorConfidence: 0.9,
      }),
    );
    expect(result.next_up_used).toBe(true);
  });

  it("6: high latency sensitivity favors lower ttft within cost band", () => {
    const baseline = walkFrontier(
      baseInput({
        qualityFloor: 1.0,
        latencySensitivity: 0.5,
      }),
    );
    const tuned = walkFrontier(
      baseInput({
        qualityFloor: 1.0,
        latencySensitivity: 2.5,
      }),
    );

    expect(tuned.pick.ttft_ms).not.toBeNull();
    expect(baseline.pick.ttft_ms).not.toBeNull();
    expect(tuned.pick.ttft_ms!).toBeLessThanOrEqual(baseline.pick.ttft_ms!);

    const maxCost = baseline.pick.cost_per_task_usd.intelligence * 1.15;
    const tunedCost =
      tuned.pick.cost_per_task_usd.intelligence ??
      tuned.pick.cost_per_task_usd.coding!;
    expect(tunedCost).toBeLessThanOrEqual(maxCost + 1e-4);
  });

  it("7: high vision noul keeps only vision-capable survivors", () => {
    const result = walkFrontier(
      baseInput({
        qualityFloor: 1.0,
        nouls: { vision: 0.9 },
      }),
    );
    expect(result.pick.capabilities.vision).toBe(true);
    for (const point of result.frontier) {
      const model = loadSnapshot().models.find((m) => m.aa_id === point.aa_id);
      expect(model?.capabilities.vision).toBe(true);
    }
  });

  it("8: strict vision+tools+coding filters on coding with very high floor", () => {
    const result = walkFrontier(
      baseInput({
        family: "coding",
        qualityFloor: 2.9,
        nouls: { vision: 0.9, tools: 0.9, code: 0.9 },
      }),
    );

    const survivors = result.frontier.map((p) =>
      loadSnapshot().models.find((m) => m.aa_id === p.aa_id)!,
    );
    for (const model of survivors) {
      expect(model.capabilities.vision).toBe(true);
      expect(model.capabilities.tools).toBe(true);
    }

    if (result.degraded) {
      expect(result.reasons.some((r) => r.includes("degraded") || r.includes("no_eligible"))).toBe(
        true,
      );
    } else {
      expect(result.pick.capabilities.vision).toBe(true);
      expect(result.pick.capabilities.tools).toBe(true);
    }
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("never picks synthetic when a non-synthetic ties on the frontier", () => {
    const snapshot = loadSnapshot();
    const result = walkFrontier(
      baseInput({
        family: "intelligence",
        qualityFloor: 0.2,
        costSensitivity: 2.5,
      }),
    );
    if (result.pick.synthetic) {
      const sameCost = snapshot.models.filter(
        (m) =>
          !m.synthetic &&
          (m.cost_per_task_usd.intelligence ===
            result.pick.cost_per_task_usd.intelligence),
      );
      expect(sameCost.length).toBe(0);
    }
  });

  it("always returns non-empty reasons", () => {
    const result = walkFrontier(baseInput());
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
