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

function capabilityGate(
  model: CatalogModel,
  needsVision: number,
  isCode: number,
): CatalogModel {
  if (needsVision >= 0.7 && !model.capabilities.includes("vision")) {
    return (
      CATALOG.find((candidate) => candidate.capabilities.includes("vision")) ??
      model
    );
  }
  if (isCode >= 0.75 && !model.capabilities.includes("code")) {
    return (
      CATALOG.find((candidate) => candidate.capabilities.includes("code")) ??
      model
    );
  }
  return model;
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

  const selected =
    getModel(modelAnswer.choice) ?? CATALOG.find((model) => model.id === "ailerix/echo-local");

  if (!selected) {
    throw new Error("Catalog is empty.");
  }

  const gated = capabilityGate(selected, vision.noul, code.noul);
  const fallback = pickFallback(gated, input.policy);

  const reasons = [
    `Jev chose ${gated.name} at ${(modelAnswer.probabilities[gated.id] ?? modelAnswer.probabilities[modelAnswer.choice] ?? 0).toFixed(2)} probability.`,
    `Vision P(yes)=${vision.noul.toFixed(2)}, code P(yes)=${code.noul.toFixed(2)}, tools P(yes)=${tools.noul.toFixed(2)}.`,
    `Complexity score ${complexity.score.toFixed(2)} on [${complexity.legend.join(" → ")}].`,
    `Policy ${input.policy}. Fallback ${fallback.name}.`,
  ];

  if (gated.id !== selected.id) {
    reasons.unshift(
      `Capability gate moved the route from ${selected.name} to ${gated.name}.`,
    );
  }

  return {
    model: gated,
    fallback,
    policy: input.policy,
    engine: decisions.engine,
    latency_ms: decisions.latency_ms,
    reasons,
    decisions,
  };
}
