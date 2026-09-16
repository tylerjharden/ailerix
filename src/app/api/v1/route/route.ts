import { isRoutingPolicy, type RoutingPolicy } from "@/lib/models";
import { routeRequest } from "@/lib/router";
import { serializeState, type SystemOneState } from "@/lib/system-one";

function completionFor(prompt: string, modelName: string, reasons: string[]): string {
  const clipped = prompt.trim().slice(0, 280);
  return [
    `Routed through ${modelName}.`,
    reasons[0] ?? "Jev produced a typed route.",
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
    const text = completionFor(
      typeof state === "string" ? state : serializeState(state),
      decision.model.name,
      decision.reasons,
    );

    return Response.json({
      id: `ailr_${crypto.randomUUID()}`,
      object: "ailerix.route",
      created: Math.floor(Date.now() / 1000),
      policy: decision.policy,
      engine: decision.engine,
      model: decision.model.id,
      fallback: decision.fallback.id,
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
