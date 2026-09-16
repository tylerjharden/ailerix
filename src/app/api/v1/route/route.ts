import { isRoutingPolicy, type RoutingPolicy } from "@/lib/models";
import { AILERIX_AUTO_MODEL_ID, routeRequest } from "@/lib/router";
import { serializeState, type SystemOneState } from "@/lib/system-one";
import type { TaskFamily } from "@/lib/families";

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

export async function POST(request: Request) {
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

    return Response.json({
      id: `ailr_${crypto.randomUUID()}`,
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Route failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
