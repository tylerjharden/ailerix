import type {
  AaFrontierPoint,
  AaModelSnapshot,
  TaskFamily,
} from "@/lib/aa/types";

export function familyQuality(
  model: AaModelSnapshot,
  family: TaskFamily,
): number {
  return model.family_scores[family] ?? model.intelligence_index;
}

export function familyCost(
  model: AaModelSnapshot,
  family: TaskFamily,
): number {
  return model.cost_per_task_usd[family] ?? model.cost_per_task_usd.intelligence;
}

function isSynthetic(model: AaModelSnapshot): boolean {
  return model.synthetic === true;
}

function compareFrontierCandidates(
  a: AaModelSnapshot,
  b: AaModelSnapshot,
  family: TaskFamily,
): number {
  const costA = familyCost(a, family);
  const costB = familyCost(b, family);
  if (costA !== costB) {
    return costA - costB;
  }

  const syntheticA = isSynthetic(a) ? 1 : 0;
  const syntheticB = isSynthetic(b) ? 1 : 0;
  if (syntheticA !== syntheticB) {
    return syntheticA - syntheticB;
  }

  const qualityA = familyQuality(a, family);
  const qualityB = familyQuality(b, family);
  if (qualityA !== qualityB) {
    return qualityB - qualityA;
  }

  return a.aa_id.localeCompare(b.aa_id);
}

export function buildFrontier(
  models: AaModelSnapshot[],
  family: TaskFamily,
): AaFrontierPoint[] {
  const sorted = [...models].sort((a, b) =>
    compareFrontierCandidates(a, b, family),
  );

  const points: AaFrontierPoint[] = [];

  for (const model of sorted) {
    const quality = familyQuality(model, family);
    const cost = familyCost(model, family);
    const maxPreviousQuality =
      points.length === 0
        ? Number.NEGATIVE_INFINITY
        : Math.max(...points.map((point) => point.quality));

    if (quality <= maxPreviousQuality) {
      continue;
    }

    points.push({
      aa_id: model.aa_id,
      family,
      quality,
      cost_per_task_usd: cost,
      gradient: Infinity,
    });
  }

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]!;
    const current = points[i]!;
    const deltaQuality = current.quality - previous.quality;
    const deltaCost = Math.max(
      current.cost_per_task_usd - previous.cost_per_task_usd,
      1e-4,
    );
    current.gradient = deltaQuality / deltaCost;
  }

  return points;
}
