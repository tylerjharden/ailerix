import { isRoutingPolicy, type RoutingPolicy } from "@/lib/models";
import { routeRequest } from "@/lib/router";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      model?: string;
      policy?: string;
    };

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
        requested_model: body.model ?? "ailerix/auto",
      },
      policy,
    });

    const content = [
      `Ailerix routed this to ${decision.model.id}.`,
      decision.reasons[0],
      `Fallback: ${decision.fallback.id}.`,
    ].join(" ");

    return Response.json({
      id: `chatcmpl_${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: decision.model.id,
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
        engine: decision.engine,
        policy: decision.policy,
        fallback: decision.fallback.id,
        decisions: decision.decisions,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Completion failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
