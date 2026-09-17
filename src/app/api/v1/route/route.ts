import { after } from "next/server";

import { recordEvent } from "@/lib/analytics/store";
import type { RouteEventInput } from "@/lib/analytics/types";
import { isRoutingPolicy, type RoutingPolicy } from "@/lib/models";
import { AILERIX_AUTO_MODEL_ID, routeRequest } from "@/lib/router";
import { serializeState, type SystemOneState } from "@/lib/system-one";
import type { TaskFamily } from "@/lib/families";

const GENERATION_HEADER = "X-Ailerix-Generation-Id";

function completionFor(
  prompt: string,
  family: TaskFamily,
  aaId: string,
  costPerTaskUsd: number,
  reasons: string[],
): string {
  const clipped = prompt.trim().slice(0, 280);
  return [
    `Routed through ${AILERIX_AUTO_MODEL_ID} to task family ${family}.`,
    `Frontier pick ${aaId} at $${costPerTaskUsd.toFixed(4)} per task.`,
    reasons[0] ?? "Jev produced a typed route along the cost-per-task frontier.",
    clipped
      ? `Prompt received (${prompt.trim().length} chars): ${clipped}${prompt.trim().length > 280 ? "…" : ""}`
      : "Empty prompt.",
    "This playground uses a local System One engine unless TYPESAFE_API_KEY is set. Completions are mocked so you can inspect the typed route without provider keys.",
  ].join("\n\n");
}

function qualityFloorScore(
  answers: Awaited<ReturnType<typeof routeRequest>>["decisions"]["answers"],
): number {
  const answer = answers.quality_floor;
  return answer?.type === "score" ? answer.score : 0;
}

export async function POST(request: Request) {
  const requestStarted = Date.now();
  const generationId = `gen_${crypto.randomUUID()}`;

  try {
    const body = (await request.json()) as {
      prompt?: string;
      state?: SystemOneState;
      policy?: string;
    };

    const state = body.state ?? body.prompt;
    if (state === undefined || (typeof state === "string" && state.trim() === "")) {
      return Response.json(
        { error: "Send a prompt or a structured state." },
        { status: 400 },
      );
    }

    const requested = body.policy ?? "balanced";
    const policy: RoutingPolicy = isRoutingPolicy(requested)
      ? requested
      : "balanced";

    const decision = await routeRequest({ state, policy });
    const promptText =
      typeof state === "string" ? state : serializeState(state);
    const text = completionFor(
      promptText,
      decision.family,
      decision.aaId,
      decision.costPerTaskUsd,
      decision.reasons,
    );

    const totalMs = Date.now() - requestStarted;
    const event: RouteEventInput = {
      generationId,
      endpoint: "route",
      policy: decision.policy,
      engine: decision.engine,
      family: decision.family,
      familyConfidence: decision.familyConfidence,
      qualityFloor: qualityFloorScore(decision.decisions.answers),
      mappedFloor: decision.floor,
      aaId: decision.aaId,
      providerSlug: decision.providerSlug,
      fallbackAaId: decision.fallbackAaId,
      nextUpUsed: decision.nextUpUsed,
      degraded: decision.degraded,
      executed: false,
      revealed: false,
      status: "route_only",
      errorCode: null,
      jevMs: decision.jevMs,
      walkMs: decision.walkMs,
      providerTtftMs: null,
      providerTotalMs: null,
      totalMs,
      promptTokens: null,
      completionTokens: null,
      reasoningTokens: null,
      costPerTaskUsd: decision.costPerTaskUsd,
      estimatedTurnUsd: null,
    };

    try {
      after(() => {
        void recordEvent(event);
      });
    } catch {
      void recordEvent(event);
    }

    return Response.json(
      {
        id: `ailr_${crypto.randomUUID()}`,
        generation_id: generationId,
        object: "ailerix.route",
        created: Math.floor(Date.now() / 1000),
        model: AILERIX_AUTO_MODEL_ID,
        family: decision.family,
        family_confidence: decision.familyConfidence,
        aa_id: decision.aaId,
        cost_per_task_usd: decision.costPerTaskUsd,
        floor: decision.floor,
        fallback_aa_id: decision.fallbackAaId,
        fallback: decision.fallbackAaId,
        next_up_used: decision.nextUpUsed,
        degraded: decision.degraded,
        policy: decision.policy,
        engine: decision.engine,
        latency_ms: decision.latency_ms,
        reasons: decision.reasons,
        decisions: decision.decisions,
        output: text,
      },
      {
        headers: {
          [GENERATION_HEADER]: generationId,
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Route failed";
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: { [GENERATION_HEADER]: generationId },
      },
    );
  }
}
