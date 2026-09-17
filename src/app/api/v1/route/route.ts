import { after } from "next/server";

import { apiError } from "@/lib/api-error";
import { recordEvent } from "@/lib/analytics/store";
import type { RouteEventInput } from "@/lib/analytics/types";
import { incrementAnonymousUsage } from "@/lib/credits";
import {
  identityFields,
  resolveRequestIdentity,
} from "@/lib/request-identity";
import { isRoutingPolicy, type RoutingPolicy } from "@/lib/models";
import { AILERIX_AUTO_MODEL_ID, routeRequest } from "@/lib/router";
import { serializeState, type SystemOneState } from "@/lib/system-one";
import type { TaskFamily } from "@/lib/families";

const GENERATION_HEADER = "X-Ailerix-Generation-Id";
const WWW_AUTHENTICATE =
  'Bearer resource_metadata="https://ailerix.com/.well-known/oauth-protected-resource"';

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
      return apiError({
        status: 400,
        message: "Send a prompt or a structured state.",
        code: "invalid_request",
        errorType: "invalid_request",
      });
    }

    const requested = body.policy ?? "balanced";
    const policy: RoutingPolicy = isRoutingPolicy(requested)
      ? requested
      : "balanced";

    const resolved = await resolveRequestIdentity(request);
    if (!resolved.ok) {
      return apiError({
        status: 401,
        message: "Invalid API key.",
        code: "invalid_api_key",
        errorType: "invalid_request",
        headers: {
          "WWW-Authenticate": WWW_AUTHENTICATE,
          [GENERATION_HEADER]: generationId,
        },
      });
    }
    const identity = resolved.identity;

    if (identity.kind === "anon") {
      const usage = await incrementAnonymousUsage(identity.anonId);
      if (usage.overLimit) {
        return apiError({
          status: 429,
          message: "Anonymous daily request limit exceeded (25 per day).",
          code: "rate_limit_exceeded",
          errorType: "rate_limit_exceeded",
          headers: { [GENERATION_HEADER]: generationId },
        });
      }
    }

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
    const ids = identityFields(identity);
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
      accountId: ids.accountId,
      apiKeyId: ids.apiKeyId,
      anonId: ids.anonId,
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
    return apiError({
      status: 500,
      message,
      code: "server_error",
      errorType: "server",
      headers: { [GENERATION_HEADER]: generationId },
    });
  }
}
