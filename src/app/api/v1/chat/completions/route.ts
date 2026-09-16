import { isRoutingPolicy, type RoutingPolicy } from "@/lib/models";
import { AILERIX_AUTO_MODEL_ID, routeRequest, type RouteDecision } from "@/lib/router";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: string; [key: string]: unknown };

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
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

function messageText(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (part.type === "text" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        if (part.type === "image_url") {
          return "[image attached: screenshot or image input]";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function ailerixTrace(decision: RouteDecision) {
  const qualityFloorScore = decision.decisions.answers.quality_floor;
  const qualityFloor =
    qualityFloorScore?.type === "score" ? qualityFloorScore.score : 0;

  return {
    family: decision.family,
    family_confidence: decision.familyConfidence,
    quality_floor: qualityFloor,
    floor: decision.floor,
    cost_per_task_usd: decision.costPerTaskUsd,
    engine: decision.engine,
    policy: decision.policy,
    fallback_aa_id: decision.fallbackAaId,
    next_up_used: decision.nextUpUsed,
  };
}

function streamingResponse(input: {
  id: string;
  created: number;
  content: string;
  decision: RouteDecision;
}): Response {
  const { id, created, content, decision } = input;
  const encoder = new TextEncoder();
  const base = {
    id,
    object: "chat.completion.chunk",
    created,
    model: AILERIX_AUTO_MODEL_ID,
  };
  const words = content.split(" ");

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({
        ...base,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      });
      for (let i = 0; i < words.length; i += 8) {
        const chunk = words.slice(i, i + 8).join(" ") + (i + 8 < words.length ? " " : "");
        send({
          ...base,
          choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
        });
      }
      send({
        ...base,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        ailerix: ailerixTrace(decision),
      });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown> & {
      messages?: ChatMessage[];
      model?: string;
      policy?: string;
      stream?: boolean;
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
    const lastUserText = lastUser ? messageText(lastUser).trim() : "";
    if (!lastUserText) {
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
        messages: messages.map((message) => ({
          role: message.role,
          content: messageText(message),
        })),
        requested_model: body.model ?? AILERIX_AUTO_MODEL_ID,
      },
      policy,
    });

    const content = [
      `Ailerix routed this through ${AILERIX_AUTO_MODEL_ID}.`,
      `Task family ${decision.family} (confidence ${(decision.familyConfidence * 100).toFixed(0)}%).`,
      `Frontier pick at $${decision.costPerTaskUsd.toFixed(4)} per task.`,
      decision.reasons[0] ?? "",
      `Fallback index: ${decision.fallbackAaId}.`,
    ]
      .filter(Boolean)
      .join(" ");

    const id = `chatcmpl_${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    if (body.stream === true) {
      return streamingResponse({ id, created, content, decision });
    }

    return Response.json({
      id,
      object: "chat.completion",
      created,
      model: AILERIX_AUTO_MODEL_ID,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: lastUserText.length,
        completion_tokens: content.length,
        total_tokens: lastUserText.length + content.length,
      },
      ailerix: ailerixTrace(decision),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Completion failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
