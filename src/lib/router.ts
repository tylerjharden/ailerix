import { loadSnapshot } from "@/lib/aa/load";
import { providerSlugFor } from "@/lib/aa/join";
import { familyCost } from "@/lib/aa/pareto";
import { walkFrontier } from "@/lib/aa/walk";
import { isTaskFamily, type TaskFamily } from "@/lib/families";
import { isExecutable } from "@/lib/providers/registry";
import type { RoutingPolicy } from "@/lib/models";
import {
  assertAnswerType,
  evaluateSystemOne,
  routingQuestions,
  serializeState,
  type DecisionEngine,
  type SystemOneResponse,
  type SystemOneState,
} from "@/lib/system-one";

export const AILERIX_AUTO_MODEL_ID = "ailerix/auto";

export type RouteDecision = {
  family: TaskFamily;
  familyConfidence: number;
  aaId: string;
  providerSlug: string;
  providerModelId: string;
  costPerTaskUsd: number;
  floor: number;
  fallbackAaId: string;
  fallbackProviderSlug: string;
  fallbackProviderModelId: string;
  nextUpUsed: boolean;
  degraded: boolean;
  policy: RoutingPolicy;
  engine: DecisionEngine;
  latency_ms: number;
  jevMs: number;
  walkMs: number;
  reasons: string[];
  decisions: SystemOneResponse;
};

const ROUTING_ANSWER_IDS = [
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

export async function routeRequest(input: {
  state: SystemOneState;
  policy: RoutingPolicy;
}): Promise<RouteDecision> {
  const started = Date.now();
  const { state, policy } = input;

  const jevStarted = Date.now();
  const decisions = await evaluateSystemOne({
    state,
    model: "jev-latest",
    questions: routingQuestions(policy),
  });
  const jevMs = Date.now() - jevStarted;

  const answers = decisions.answers;
  for (const id of ROUTING_ANSWER_IDS) {
    const answer = answers[id];
    if (!answer) {
      throw new Error(`Missing Jev answer: ${id}`);
    }
  }

  const taskFamilyAnswer = assertAnswerType(answers.task_family, "choice");
  const qualityFloor = assertAnswerType(answers.quality_floor, "score");
  const costSensitivity = assertAnswerType(answers.cost_sensitivity, "score");
  const latencySensitivity = assertAnswerType(
    answers.latency_sensitivity,
    "score",
  );
  const needsVision = assertAnswerType(answers.needs_vision, "noul");
  const needsTools = assertAnswerType(answers.needs_tools, "noul");
  const isCode = assertAnswerType(answers.is_code, "noul");
  const hallucinationSensitive = assertAnswerType(
    answers.hallucination_sensitive,
    "noul",
  );
  const needsLongContext = assertAnswerType(answers.needs_long_context, "noul");

  const reasons: string[] = [];
  let family: TaskFamily;
  if (isTaskFamily(taskFamilyAnswer.choice)) {
    family = taskFamilyAnswer.choice;
  } else {
    family = "intelligence";
    reasons.push(
      `unknown_family: Jev returned "${taskFamilyAnswer.choice}"; defaulting to intelligence`,
    );
  }

  const familyConfidence = taskFamilyAnswer.confidence;

  let requiredContext: number | undefined;
  if (needsLongContext.noul >= 0.7) {
    requiredContext = serializeState(state).length;
  }

  const fullSnapshot = loadSnapshot();
  let executableModels = fullSnapshot.models.filter((model) =>
    isExecutable(model.provider_slug),
  );
  if (executableModels.length === 0) {
    executableModels = fullSnapshot.models;
    reasons.push("no_executable_provider");
  }
  const snapshot = { ...fullSnapshot, models: executableModels };

  const walkStarted = Date.now();
  const walk = walkFrontier({
    snapshot,
    family,
    familyConfidence,
    scores: {
      qualityFloor,
      costSensitivity,
      latencySensitivity,
    },
    nouls: {
      vision: needsVision.noul,
      tools: needsTools.noul,
      code: isCode.noul,
      hallucination: hallucinationSensitive.noul,
      longContext: needsLongContext.noul,
    },
    requiredContext,
  });
  const walkMs = Date.now() - walkStarted;

  const mergedReasons = [...reasons, ...walk.reasons];
  const costPerTaskUsd = familyCost(walk.pick, family);

  return {
    family,
    familyConfidence,
    aaId: walk.pick.aa_id,
    providerSlug: providerSlugFor(walk.pick),
    providerModelId: walk.pick.provider_model_id,
    costPerTaskUsd,
    floor: walk.floor,
    fallbackAaId: walk.fallback.aa_id,
    fallbackProviderSlug: providerSlugFor(walk.fallback),
    fallbackProviderModelId: walk.fallback.provider_model_id,
    nextUpUsed: walk.next_up_used,
    degraded: walk.degraded,
    policy,
    engine: decisions.engine,
    latency_ms: Date.now() - started,
    jevMs,
    walkMs,
    reasons: mergedReasons,
    decisions,
  };
}
