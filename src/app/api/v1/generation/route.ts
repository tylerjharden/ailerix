import { getEvent } from "@/lib/analytics/store";
import type { StoredRouteEvent } from "@/lib/analytics/types";
import { apiError } from "@/lib/api-error";

function toPublicGeneration(event: StoredRouteEvent) {
  return {
    id: event.generationId,
    created_at: Math.floor(event.createdAt.getTime() / 1000),
    endpoint: event.endpoint,
    policy: event.policy,
    engine: event.engine,
    family: event.family,
    family_confidence: event.familyConfidence,
    quality_floor: event.qualityFloor,
    mapped_floor: event.mappedFloor,
    aa_id: event.aaId,
    fallback_aa_id: event.fallbackAaId,
    next_up_used: event.nextUpUsed,
    degraded: event.degraded,
    executed: event.executed,
    status: event.status,
    latency: {
      jev_ms: event.jevMs,
      walk_ms: event.walkMs,
      provider_ttft_ms: event.providerTtftMs,
      provider_total_ms: event.providerTotalMs,
      total_ms: event.totalMs,
    },
    usage: {
      prompt_tokens: event.promptTokens,
      completion_tokens: event.completionTokens,
      reasoning_tokens: event.reasoningTokens,
    },
    cost: {
      cost_per_task_usd: event.costPerTaskUsd,
      estimated_turn_usd: event.estimatedTurnUsd,
    },
  };
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return apiError({
      status: 400,
      message: "Missing required query parameter `id`.",
      code: "invalid_request",
      errorType: "invalid_request",
    });
  }

  const event = await getEvent(id);
  if (!event) {
    return apiError({
      status: 404,
      message: "Generation not found.",
      code: "not_found",
      errorType: "not_found",
    });
  }

  return Response.json({ data: toPublicGeneration(event) });
}
