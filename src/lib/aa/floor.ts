import { familyQuality } from "@/lib/aa/pareto";
import type { AaModelSnapshot, TaskFamily } from "@/lib/aa/types";

const BANDS = [15, 40, 65, 85] as const;

function bandIndexForScore(score: number): number {
  if (score < 0.75) {
    return 0;
  }
  if (score < 1.5) {
    return 1;
  }
  if (score < 2.25) {
    return 2;
  }
  return 3;
}

/**
 * Linear interpolation with exclusive (n+1) ranks (Excel PERCENTILE.EXC style):
 * 1-based position = (p/100) * (n + 1), then linearly interpolate between the
 * surrounding order statistics in the sorted eligible qualities.
 */
function interpolatedPercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0]!;
  }

  const p = Math.min(100, Math.max(0, percentile)) / 100;
  const n = sorted.length;
  const position = p * (n + 1);
  const rank = position - 1;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);

  if (lower < 0) {
    return sorted[0]!;
  }
  if (upper >= n) {
    return sorted[n - 1]!;
  }
  if (lower === upper) {
    return sorted[lower]!;
  }

  const weight = rank - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

export function mapQualityFloor(input: {
  qualityFloorScore: number;
  hallucinationNoul: number;
  eligible: AaModelSnapshot[];
  family: TaskFamily;
}): number {
  const qualities = input.eligible.map((model) =>
    familyQuality(model, input.family),
  );
  qualities.sort((a, b) => a - b);

  let bandIdx = bandIndexForScore(input.qualityFloorScore);
  if (input.hallucinationNoul >= 0.8 && bandIdx < BANDS.length - 1) {
    bandIdx += 1;
  }

  return interpolatedPercentile(qualities, BANDS[bandIdx]);
}
