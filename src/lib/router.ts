import {
  CATALOG,
  getModel,
  type CatalogModel,
  type RoutingPolicy,
} from "@/lib/models";
import {
  assertAnswerType,
  evaluateSystemOne,
  routingQuestions,
  type DecisionEngine,
  type SystemOneResponse,
  type SystemOneState,
} from "@/lib/system-one";

export type RouteDecision = {
  model: CatalogModel;
  fallback: CatalogModel;
  policy: RoutingPolicy;
  engine: DecisionEngine;
  latency_ms: number;
  reasons: string[];
  decisions: SystemOneResponse;
};

function pickFallback(primary: CatalogModel, policy: RoutingPolicy): CatalogModel {
  const others = CATALOG.filter((model) => model.id !== primary.id);
  const ranked = [...others].sort((a, b) => {
    switch (policy) {
      case "cheap":
        return a.inputPerMTok - b.inputPerMTok;
      case "latency":
        return a.latencyMs - b.latencyMs;
      case "quality":
        return b.quality - a.quality;
      case "balanced":
        return (
          a.inputPerMTok * 0.4 +
          a.latencyMs / 4000 -
          a.quality -
          (b.inputPerMTok * 0.4 + b.latencyMs / 4000 - b.quality)
        );
      default: {
        const _exhaustive: never = policy;
        throw new Error(`Unhandled policy: ${_exhaustive}`);
      }
    }
  });

  return ranked[0] ?? CATALOG[CATALOG.length - 1];
}

function rankByPolicy(
  probabilities: Record<string, number>,
  policy: RoutingPolicy,
  needsVision: number,
  isCode: number,
): CatalogModel {
  const eligible = Object.entries(probabilities)
    .map(([id, probability]) => {
      const model = getModel(id);
      return model ? { model, probability } : null;
    })
    .filter((row): row is { model: CatalogModel; probability: number } => row !== null)
    .filter(({ model }) => {
      if (needsVision >= 0.7 && !model.capabilities.includes("vision")) return false;
      if (isCode >= 0.75 && !model.capabilities.includes("code")) return false;
      return true;
    });

  const scored = eligible.map(({ model, probability }) => {
    let utility = probability;
    switch (policy) {
      case "cheap":
        utility = probability / (0.05 + model.inputPerMTok);
        break;
      case "latency":
        utility = probability / (80 + model.latencyMs);
        break;
      case "quality":
        utility = probability * model.quality;
        break;
      case "balanced":
        utility =
          (probability * model.quality) /
          (0.25 + model.inputPerMTok) /
          (1 + model.latencyMs / 5000);
        break;
      default: {
        const _exhaustive: never = policy;
        throw new Error(`Unhandled policy: ${_exhaustive}`);
      }
    }
    return { model, utility };
  });

  scored.sort((a, b) => b.utility - a.utility);
  return scored[0]?.model ?? CATALOG[CATALOG.length - 1];
}

export async function routeRequest(input: {
  state: SystemOneState;
  policy: RoutingPolicy;
}): Promise<RouteDecision> {
  const decisions = await evaluateSystemOne({
    state: input.state,
    model: "jev-latest",
    questions: routingQuestions(input.policy),
  });

  const modelAnswer = assertAnswerType(decisions.answers.model, "choice");
  const vision = assertAnswerType(decisions.answers.needs_vision, "noul");
  const code = assertAnswerType(decisions.answers.is_code, "noul");
  const tools = assertAnswerType(decisions.answers.needs_tools, "noul");
  const complexity = assertAnswerType(decisions.answers.complexity, "score");

  const selected = rankByPolicy(
    modelAnswer.probabilities,
    input.policy,
    vision.noul,
    code.noul,
  );
  const fallback = pickFallback(selected, input.policy);

  const reasons = [
    `Jev's top label was ${modelAnswer.choice} at ${(modelAnswer.probabilities[modelAnswer.choice] ?? 0).toFixed(2)}; policy ${input.policy} banked ${selected.name}.`,
    `Vision P(yes)=${vision.noul.toFixed(2)}, code P(yes)=${code.noul.toFixed(2)}, tools P(yes)=${tools.noul.toFixed(2)}.`,
    `Complexity score ${complexity.score.toFixed(2)} on [${complexity.legend.join(" → ")}].`,
    `Fallback ${fallback.name}.`,
  ];

  return {
    model: selected,
    fallback,
    policy: input.policy,
    engine: decisions.engine,
    latency_ms: decisions.latency_ms,
    reasons,
    decisions,
  };
}
