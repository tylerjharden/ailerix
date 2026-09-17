import { after } from "next/server";

import { apiError } from "@/lib/api-error";
import { recordEvent } from "@/lib/analytics/store";
import type { RouteEventInput } from "@/lib/analytics/types";
import {
  executeRoute,
  ProviderUnavailableError,
  type ExecuteParams,
  type ExecutionJsonResult,
  type ExecutionStreamDone,
} from "@/lib/execute";
import { isRoutingPolicy, type RoutingPolicy } from "@/lib/models";
import type { AdapterEvent, AdapterMessage } from "@/lib/providers/types";
import { AILERIX_AUTO_MODEL_ID, routeRequest, type RouteDecision } from "@/lib/router";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: string; [key: string]: unknown };

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: unknown[];
};

const FORBIDDEN_BODY_KEYS = ["models", "provider", "plugins", "preset"] as const;

const GENERATION_HEADER = "X-Ailerix-Generation-Id";

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

function toAdapterMessages(messages: ChatMessage[]): AdapterMessage[] {
  return messages.map((message) => {
    const base: AdapterMessage = {
      role: message.role,
      content:
        message.content === null
          ? ""
          : typeof message.content === "string"
            ? message.content
            : message.content.map((part) => ({ ...part })),
    };
    if (message.tool_call_id !== undefined) {
      base.tool_call_id = message.tool_call_id;
    }
    if (message.tool_calls !== undefined) {
      base.tool_calls = message.tool_calls;
    }
    return base;
  });
}

function qualityFloorScore(decision: RouteDecision): number {
  const answer = decision.decisions.answers.quality_floor;
  return answer?.type === "score" ? answer.score : 0;
}

function ailerixTrace(
  decision: RouteDecision,
  execution?: {
    executed: boolean;
    estimated_turn_usd: number | null;
    fallback_used: boolean;
    dropped_params: string[];
    revealed_model?: string;
  },
) {
  return {
    family: decision.family,
    family_confidence: decision.familyConfidence,
    quality_floor: qualityFloorScore(decision),
    floor: decision.floor,
    cost_per_task_usd: decision.costPerTaskUsd,
    engine: decision.engine,
    policy: decision.policy,
    fallback_aa_id: decision.fallbackAaId,
    next_up_used: decision.nextUpUsed,
    executed: execution?.executed ?? false,
    estimated_turn_usd: execution?.estimated_turn_usd ?? null,
    fallback_used: execution?.fallback_used ?? false,
    dropped_params: execution?.dropped_params ?? [],
    ...(execution?.revealed_model
      ? { revealed_model: execution.revealed_model }
      : {}),
  };
}

function estimateUsageChars(
  adapterMessages: AdapterMessage[],
  content: string,
): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
  const promptChars = adapterMessages.reduce((sum, m) => {
    if (typeof m.content === "string") return sum + m.content.length;
    return (
      sum +
      m.content.reduce((s, p) => {
        if (p.type === "text" && typeof p.text === "string") return s + p.text.length;
        return s;
      }, 0)
    );
  }, 0);
  const prompt_tokens = Math.ceil(promptChars / 4);
  const completion_tokens = Math.ceil(content.length / 4);
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
  };
}

function openAiUsage(
  adapterMessages: AdapterMessage[],
  content: string,
  usage: ExecutionJsonResult["usage"] | ExecutionStreamDone["usage"],
) {
  if (usage) {
    const total =
      usage.prompt_tokens +
      usage.completion_tokens +
      (usage.reasoning_tokens ?? 0);
    return {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: total,
    };
  }
  return estimateUsageChars(adapterMessages, content);
}

function buildRouteEventInput(input: {
  generationId: string;
  decision: RouteDecision;
  revealed: boolean;
  status: RouteEventInput["status"];
  executed: boolean;
  errorCode?: string | null;
  providerTtftMs?: number | null;
  providerTotalMs?: number | null;
  totalMs: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  estimatedTurnUsd?: number | null;
}): RouteEventInput {
  const { decision } = input;
  return {
    generationId: input.generationId,
    endpoint: "chat.completions",
    policy: decision.policy,
    engine: decision.engine,
    family: decision.family,
    familyConfidence: decision.familyConfidence,
    qualityFloor: qualityFloorScore(decision),
    mappedFloor: decision.floor,
    aaId: decision.aaId,
    providerSlug: decision.providerSlug,
    fallbackAaId: decision.fallbackAaId,
    nextUpUsed: decision.nextUpUsed,
    degraded: decision.degraded,
    executed: input.executed,
    revealed: input.revealed,
    status: input.status,
    errorCode: input.errorCode ?? null,
    jevMs: decision.jevMs,
    walkMs: decision.walkMs,
    providerTtftMs: input.providerTtftMs ?? null,
    providerTotalMs: input.providerTotalMs ?? null,
    totalMs: input.totalMs,
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    reasoningTokens: input.reasoningTokens ?? null,
    costPerTaskUsd: decision.costPerTaskUsd,
    estimatedTurnUsd: input.estimatedTurnUsd ?? null,
  };
}

function deferAfter(task: () => void | Promise<void>): void {
  try {
    after(task);
  } catch {
    void Promise.resolve().then(task);
  }
}

function persistEvent(event: RouteEventInput): void {
  deferAfter(() => {
    void recordEvent(event);
  });
}

function streamingResponse(input: {
  generationId: string;
  created: number;
  decision: RouteDecision;
  revealed: boolean;
  responseModel: string;
  events: AsyncGenerator<AdapterEvent>;
  onDone: Promise<ExecutionStreamDone>;
  adapterMessages: AdapterMessage[];
  requestStarted: number;
}): Response {
  const encoder = new TextEncoder();
  const {
    generationId,
    created,
    decision,
    revealed,
    responseModel,
    events,
    onDone,
    adapterMessages,
    requestStarted,
  } = input;

  const base = {
    id: generationId,
    object: "chat.completion.chunk",
    created,
    model: responseModel,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({
        ...base,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      });

      try {
        for await (const event of events) {
          if (event.type === "delta") {
            send({
              ...base,
              choices: [
                { index: 0, delta: { content: event.content }, finish_reason: null },
              ],
            });
          } else if (event.type === "tool_calls") {
            send({
              ...base,
              choices: [
                {
                  index: 0,
                  delta: { tool_calls: event.tool_calls },
                  finish_reason: null,
                },
              ],
            });
          } else if (event.type === "done") {
            // final chunk emitted after onDone resolves
          } else {
            const _exhaustive: never = event;
            throw new Error(`Unknown adapter event: ${String(_exhaustive)}`);
          }
        }

        const done = await onDone;
        const usage = openAiUsage(adapterMessages, done.content, done.usage);
        const totalMs = Date.now() - requestStarted;
        const finalModel = revealed ? done.executedSlug : responseModel;

        send({
          ...base,
          model: finalModel,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: done.finish_reason,
            },
          ],
          usage,
          ailerix: ailerixTrace(decision, {
            executed: true,
            estimated_turn_usd: done.estimatedTurnUsd,
            fallback_used: done.fallbackUsed,
            dropped_params: done.droppedParams,
            ...(revealed ? { revealed_model: done.executedSlug } : {}),
          }),
        });

        deferAfter(async () => {
          await recordEvent(
            buildRouteEventInput({
              generationId,
              decision,
              revealed,
              status: done.fallbackUsed ? "fallback_used" : "ok",
              executed: true,
              providerTtftMs: done.ttftMs,
              providerTotalMs: done.totalMs,
              totalMs,
              promptTokens: done.usage?.prompt_tokens ?? usage.prompt_tokens,
              completionTokens:
                done.usage?.completion_tokens ?? usage.completion_tokens,
              reasoningTokens: done.usage?.reasoning_tokens ?? null,
              estimatedTurnUsd: done.estimatedTurnUsd,
            }),
          );
        });

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      [GENERATION_HEADER]: generationId,
    },
  });
}

function extractExecuteParams(body: Record<string, unknown>): ExecuteParams {
  const reasoning = body.reasoning;
  return {
    temperature: typeof body.temperature === "number" ? body.temperature : undefined,
    top_p: typeof body.top_p === "number" ? body.top_p : undefined,
    max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
    max_completion_tokens:
      typeof body.max_completion_tokens === "number"
        ? body.max_completion_tokens
        : undefined,
    stop: body.stop as string | string[] | undefined,
    tools: body.tools as unknown[] | undefined,
    tool_choice: body.tool_choice,
    response_format: body.response_format,
    reasoning:
      reasoning && typeof reasoning === "object" && reasoning !== null
        ? {
            effort:
              typeof (reasoning as { effort?: unknown }).effort === "string"
                ? (reasoning as { effort: string }).effort
                : undefined,
          }
        : undefined,
    logit_bias: body.logit_bias,
    seed: body.seed,
  };
}

export async function POST(request: Request) {
  const requestStarted = Date.now();
  const generationId = `gen_${crypto.randomUUID()}`;

  try {
    const body = (await request.json()) as Record<string, unknown> & {
      messages?: ChatMessage[];
      model?: string;
      policy?: string;
      stream?: boolean;
    };

    for (const field of FORBIDDEN_BODY_KEYS) {
      if (field in body) {
        return apiError({
          status: 400,
          message: `Parameter \`${field}\` is not allowed.`,
          code: "parameter_not_allowed",
          errorType: "parameter_not_allowed",
        });
      }
    }

    if (body.model !== undefined && body.model !== AILERIX_AUTO_MODEL_ID) {
      return apiError({
        status: 400,
        message:
          'Ailerix routes every request; model must be omitted or "ailerix/auto".',
        code: "model_not_allowed",
        errorType: "model_not_allowed",
      });
    }

    const messages = body.messages ?? [];
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const lastUserText = lastUser ? messageText(lastUser).trim() : "";
    if (!lastUserText) {
      return apiError({
        status: 400,
        message: "messages must include a user turn",
        code: "invalid_request",
        errorType: "invalid_request",
      });
    }

    const requested = body.policy ?? "balanced";
    const policy: RoutingPolicy = isRoutingPolicy(requested)
      ? requested
      : "balanced";

    const revealed = request.headers.get("x-ailerix-reveal-route") === "1";

    let decision: RouteDecision;
    decision = await routeRequest({
      state: {
        messages: messages.map((message) => ({
          role: message.role,
          content: messageText(message),
        })),
        requested_model: body.model ?? AILERIX_AUTO_MODEL_ID,
      },
      policy,
    });

    const adapterMessages = toAdapterMessages(messages);
    const executeParams = extractExecuteParams(body);

    let execution;
    try {
      execution = await executeRoute({
        decision,
        messages: adapterMessages,
        stream: body.stream === true,
        params: executeParams,
        revealed,
      });
    } catch (executeError) {
      if (executeError instanceof ProviderUnavailableError) {
        const totalMs = Date.now() - requestStarted;
        persistEvent(
          buildRouteEventInput({
            generationId,
            decision,
            revealed,
            status: "provider_error",
            executed: false,
            errorCode: "provider_unavailable",
            totalMs,
          }),
        );
        return apiError({
          status: 502,
          message: executeError.message,
          code: "provider_unavailable",
          errorType: "provider_unavailable",
          headers: { [GENERATION_HEADER]: generationId },
        });
      }
      throw executeError;
    }

    const created = Math.floor(Date.now() / 1000);

    if (execution.kind === "stream") {
      const responseModel = revealed
        ? decision.providerSlug
        : AILERIX_AUTO_MODEL_ID;

      return streamingResponse({
        generationId,
        created,
        decision,
        revealed,
        responseModel,
        events: execution.events,
        onDone: execution.onDone,
        adapterMessages,
        requestStarted,
      });
    }

    const usage = openAiUsage(adapterMessages, execution.content, execution.usage);
    const totalMs = Date.now() - requestStarted;
    const responseModel = revealed ? execution.executedSlug : AILERIX_AUTO_MODEL_ID;

    const assistantMessage: {
      role: "assistant";
      content: string;
      tool_calls?: unknown[];
    } = {
      role: "assistant",
      content: execution.content,
    };
    if (execution.tool_calls !== undefined) {
      assistantMessage.tool_calls = execution.tool_calls;
    }

    persistEvent(
      buildRouteEventInput({
        generationId,
        decision,
        revealed,
        status: execution.fallbackUsed ? "fallback_used" : "ok",
        executed: true,
        providerTtftMs: execution.ttftMs,
        providerTotalMs: execution.totalMs,
        totalMs,
        promptTokens: execution.usage?.prompt_tokens ?? usage.prompt_tokens,
        completionTokens:
          execution.usage?.completion_tokens ?? usage.completion_tokens,
        reasoningTokens: execution.usage?.reasoning_tokens ?? null,
        estimatedTurnUsd: execution.estimatedTurnUsd,
      }),
    );

    return Response.json(
      {
        id: generationId,
        object: "chat.completion",
        created,
        model: responseModel,
        choices: [
          {
            index: 0,
            message: assistantMessage,
            finish_reason: execution.finish_reason,
          },
        ],
        usage,
        ailerix: ailerixTrace(decision, {
          executed: true,
          estimated_turn_usd: execution.estimatedTurnUsd,
          fallback_used: execution.fallbackUsed,
          dropped_params: execution.droppedParams,
          ...(revealed ? { revealed_model: execution.executedSlug } : {}),
        }),
      },
      {
        headers: {
          [GENERATION_HEADER]: generationId,
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Completion failed";
    return apiError({
      status: 500,
      message,
      code: "server_error",
      errorType: "server",
      headers: { [GENERATION_HEADER]: generationId },
    });
  }
}
