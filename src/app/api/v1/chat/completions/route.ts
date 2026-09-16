import { isRoutingPolicy, type RoutingPolicy } from "@/lib/models";
import { AILERIX_AUTO_MODEL_ID, routeRequest } from "@/lib/router";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const FORBIDDEN_BODY_KEYS = ["models", "provider", "plugins", "preset"] as const;

function invalidModelResponse() {
  return Response.json(
    {
      error: {
        message:
          'Ailerix routes every request; model must be omitted or "ailerix/auto".',
        type: "invalid_request_error",
        code: "model_not_allowed",
      },
    },
    { status: 400 },
  );
}

function parameterNotAllowedResponse(field: string) {
  return Response.json(
    {
      error: {
        message: `Parameter \`${field}\` is not allowed.`,
        type: "invalid_request_error",
        code: "parameter_not_allowed",
      },
    },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown> & {
      messages?: ChatMessage[];
      model?: string;
      policy?: string;
    };

    for (const field of FORBIDDEN_BODY_KEYS) {
      if (field in body) {
        return parameterNotAllowedResponse(field);
      }
    }

    if (body.model !== undefined && body.model !== AILERIX_AUTO_MODEL_ID) {
      return invalidModelResponse();
    }

    const messages = body.messages ?? [];
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser?.content?.trim()) {
      return Response.json(
        { error: "messages must include a user turn" },
        { status: 400 },
      );
    }

    const requested = body.policy ?? "balanced";
    const policy: RoutingPolicy = isRoutingPolicy(requested)
      ? requested
      : "balanced";

    const decision = await routeRequest({
      state: {
        messages,
        requested_model: body.model ?? AILERIX_AUTO_MODEL_ID,
      },
      policy,
    });

    const qualityFloorScore = decision.decisions.answers.quality_floor;
    const qualityFloor =
      qualityFloorScore?.type === "score" ? qualityFloorScore.score : 0;

    const content = [
      `Ailerix routed this through ${AILERIX_AUTO_MODEL_ID}.`,
      `Task family ${decision.family} (confidence ${(decision.familyConfidence * 100).toFixed(0)}%).`,
      `Frontier pick at $${decision.costPerTaskUsd.toFixed(4)} per task.`,
      decision.reasons[0] ?? "",
      `Fallback index: ${decision.fallbackAaId}.`,
    ]
      .filter(Boolean)
      .join(" ");

    return Response.json({
      id: `chatcmpl_${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: AILERIX_AUTO_MODEL_ID,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: lastUser.content.length,
        completion_tokens: content.length,
        total_tokens: lastUser.content.length + content.length,
      },
      ailerix: {
        family: decision.family,
        family_confidence: decision.familyConfidence,
        quality_floor: qualityFloor,
        floor: decision.floor,
        cost_per_task_usd: decision.costPerTaskUsd,
        engine: decision.engine,
        policy: decision.policy,
        fallback_aa_id: decision.fallbackAaId,
        next_up_used: decision.nextUpUsed,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Completion failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
