import { mapQualityFloor } from "@/lib/aa/floor";
import { buildFrontier, familyCost } from "@/lib/aa/pareto";
import type { ScoreAnswer } from "@/lib/system-one";
import type {
  AaFrontierPoint,
  AaModelSnapshot,
  AaSnapshot,
  TaskFamily,
} from "@/lib/aa/types";

export const LATENCY_BAND = 0.15;
export const EPSILON = 1e-4;
const FAMILY_CONFIDENCE_THRESHOLD = 0.55;
const FLOOR_CONFIDENCE_THRESHOLD = 0.5;

export type WalkInput = {
  snapshot: AaSnapshot;
  family: TaskFamily;
  familyConfidence: number;
  scores: {
    qualityFloor: ScoreAnswer;
    costSensitivity: ScoreAnswer;
    latencySensitivity: ScoreAnswer;
  };
  nouls: {
    vision: number;
    tools: number;
    code: number;
    hallucination: number;
    longContext: number;
  };
  requiredContext?: number;
};

export type WalkResult = {
  pick: AaModelSnapshot;
  fallback: AaModelSnapshot;
  frontier: AaFrontierPoint[];
  floor: number;
  next_up_used: boolean;
  degraded: boolean;
  reasons: string[];
};

function findEchoLocal(snapshot: AaSnapshot): AaModelSnapshot {
  const echo = snapshot.models.find((model) => model.aa_id === "echo-local");
  if (!echo) {
    throw new Error("snapshot missing echo-local row");
  }
  return echo;
}

function filterEligible(
  models: AaModelSnapshot[],
  input: WalkInput,
): AaModelSnapshot[] {
  return models.filter((model) => {
    if (input.nouls.vision >= 0.7 && !model.capabilities.vision) {
      return false;
    }
    if (input.nouls.tools >= 0.7 && !model.capabilities.tools) {
      return false;
    }
    if (
      input.family === "coding" &&
      input.nouls.code >= 0.75 &&
      !model.capabilities.code
    ) {
      return false;
    }
    if (
      input.requiredContext !== undefined &&
      input.nouls.longContext >= 0.7 &&
      model.context_window < input.requiredContext
    ) {
      return false;
    }
    return true;
  });
}

function modelById(
  models: AaModelSnapshot[],
  aaId: string,
): AaModelSnapshot | undefined {
  return models.find((model) => model.aa_id === aaId);
}

function medianPositiveFiniteGradients(frontier: AaFrontierPoint[]): number {
  const values = frontier
    .map((point) => point.gradient)
    .filter((g) => g > 0 && Number.isFinite(g))
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return Infinity;
  }

  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[mid]!;
  }
  return (values[mid - 1]! + values[mid]!) / 2;
}

function compareLatency(
  a: AaModelSnapshot,
  b: AaModelSnapshot,
): number {
  const ttftA = a.ttft_ms;
  const ttftB = b.ttft_ms;
  if (ttftA === null && ttftB === null) {
    return 0;
  }
  if (ttftA === null) {
    return 1;
  }
  if (ttftB === null) {
    return -1;
  }
  if (ttftA !== ttftB) {
    return ttftA - ttftB;
  }
  const opsA = a.output_tokens_per_sec ?? 0;
  const opsB = b.output_tokens_per_sec ?? 0;
  return opsB - opsA;
}

export function walkFrontier(input: WalkInput): WalkResult {
  const reasons: string[] = [];
  const echoLocal = findEchoLocal(input.snapshot);

  let eligible = filterEligible(input.snapshot.models, input);
  if (eligible.length === 0) {
    reasons.push(
      `no_eligible_model: task family ${input.family} left no models after capability filters; using echo-local`,
    );
    return {
      pick: echoLocal,
      fallback: echoLocal,
      frontier: [],
      floor: 0,
      next_up_used: false,
      degraded: true,
      reasons,
    };
  }

  const frontier = buildFrontier(eligible, input.family);
  const floor = mapQualityFloor({
    qualityFloorScore: input.scores.qualityFloor.score,
    hallucinationNoul: input.nouls.hallucination,
    eligible,
    family: input.family,
  });

  let degraded = false;
  let candidates = frontier.filter(
    (point) => point.quality >= floor - EPSILON,
  );

  if (candidates.length === 0) {
    const best = frontier.at(-1);
    if (!best) {
      reasons.push(
        `no_eligible_model: empty frontier for family ${input.family}; using echo-local`,
      );
      return {
        pick: echoLocal,
        fallback: echoLocal,
        frontier,
        floor,
        next_up_used: false,
        degraded: true,
        reasons,
      };
    }
    candidates = [best];
    degraded = true;
    reasons.push(
      `degraded_best_available: no frontier point met quality floor ${floor.toFixed(2)}; using best available ${best.aa_id}`,
    );
  }

  let pickIndex = 0;
  let next_up_used = false;

  const lowConfidence =
    input.familyConfidence < FAMILY_CONFIDENCE_THRESHOLD ||
    input.scores.qualityFloor.confidence < FLOOR_CONFIDENCE_THRESHOLD;

  if (lowConfidence && pickIndex + 1 < candidates.length) {
    pickIndex += 1;
    next_up_used = true;
    reasons.push(
      "next_up_low_confidence: stepped one tier up on the cost-quality frontier due to low classification confidence",
    );
  } else if (input.scores.costSensitivity.score < 1.0) {
    const slopeWorthIt = medianPositiveFiniteGradients(frontier);
    const above = candidates[pickIndex + 1];
    if (above && above.gradient > slopeWorthIt) {
      pickIndex += 1;
      next_up_used = true;
      reasons.push(
        "next_up_steep_gradient: stepped one tier up because marginal quality gain exceeds typical frontier slope and spend sensitivity is low",
      );
    }
  }

  let pickPoint = candidates[pickIndex]!;

  if (input.scores.latencySensitivity.score >= 2) {
    const maxCost = pickPoint.cost_per_task_usd * (1 + LATENCY_BAND);
    const latencyPool = candidates.filter(
      (point) => point.cost_per_task_usd <= maxCost + EPSILON,
    );
    if (latencyPool.length > 0) {
      let bestPoint = latencyPool[0]!;
      let bestModel = modelById(eligible, bestPoint.aa_id)!;
      for (const point of latencyPool) {
        const model = modelById(eligible, point.aa_id)!;
        if (compareLatency(model, bestModel) < 0) {
          bestPoint = point;
          bestModel = model;
        }
      }
      pickPoint = bestPoint;
    }
  }

  const pick =
    modelById(eligible, pickPoint.aa_id) ??
    modelById(input.snapshot.models, pickPoint.aa_id)!;

  const pickCandidateIndex = candidates.findIndex(
    (point) => point.aa_id === pickPoint.aa_id,
  );
  let fallback: AaModelSnapshot;
  if (
    pickCandidateIndex >= 0 &&
    pickCandidateIndex + 1 < candidates.length
  ) {
    const fallbackId = candidates[pickCandidateIndex + 1]!.aa_id;
    fallback = modelById(eligible, fallbackId)!;
  } else if (pickCandidateIndex > 0) {
    const fallbackId = candidates[pickCandidateIndex - 1]!.aa_id;
    fallback = modelById(eligible, fallbackId)!;
  } else {
    fallback = echoLocal;
  }

  const pickCost = familyCost(pick, input.family);
  reasons.unshift(
    `family ${input.family}: quality floor ${floor.toFixed(2)}; selected ${pick.aa_id} at $${pickCost.toFixed(4)}/task`,
  );

  return {
    pick,
    fallback,
    frontier,
    floor,
    next_up_used,
    degraded,
    reasons,
  };
}
