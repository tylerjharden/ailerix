import {
  ProviderError,
  type AdapterCompletion,
  type AdapterEvent,
  type AdapterMessage,
  type AdapterRequest,
  type AdapterUsage,
  type ProviderAdapter,
} from "@/lib/providers/types";

type OpenAiCompatConfig = {
  baseUrl: string;
  apiKeyEnv: string;
};

function getApiKey(apiKeyEnv: string): string {
  const key = process.env[apiKeyEnv];
  if (!key || key.trim() === "") {
    throw new ProviderError(
      `Missing API key: set ${apiKeyEnv}`,
      "missing_key",
    );
  }
  return key;
}

function messageContentToOpenAi(
  content: string | Array<{ type: string; [k: string]: unknown }>,
): string | Array<{ type: string; [k: string]: unknown }> {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return part;
    if (part.type === "image_url" || part.type === "image") return part;
    if (typeof part.text === "string") return { type: "text", text: part.text };
    return { type: "text", text: JSON.stringify(part) };
  });
}

function buildOpenAiBody(req: AdapterRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.providerModelId,
    messages: req.messages.map((m) => ({
      role: m.role,
      content: messageContentToOpenAi(m.content),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    })),
    stream: req.stream,
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.top_p !== undefined) body.top_p = req.top_p;
  if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;
  if (req.stop !== undefined) body.stop = req.stop;
  if (req.tools !== undefined) body.tools = req.tools;
  if (req.tool_choice !== undefined) body.tool_choice = req.tool_choice;
  if (req.response_format !== undefined) body.response_format = req.response_format;
  if (req.reasoning_effort !== undefined) body.reasoning_effort = req.reasoning_effort;
  if (req.stream) {
    body.stream_options = { include_usage: true };
  }
  return body;
}

function mapUsage(raw: Record<string, unknown> | undefined | null): AdapterUsage | null {
  if (!raw) return null;
  const prompt = typeof raw.prompt_tokens === "number" ? raw.prompt_tokens : 0;
  const completion =
    typeof raw.completion_tokens === "number" ? raw.completion_tokens : 0;
  const reasoning =
    typeof raw.completion_tokens_details === "object" &&
    raw.completion_tokens_details !== null &&
    typeof (raw.completion_tokens_details as Record<string, unknown>)
      .reasoning_tokens === "number"
      ? (raw.completion_tokens_details as Record<string, number>).reasoning_tokens
      : undefined;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    ...(reasoning !== undefined ? { reasoning_tokens: reasoning } : {}),
  };
}

export type OpenAiStreamParseState = {
  finishReason: string;
  usage: AdapterUsage | null;
  toolCalls: unknown[] | null;
};

export async function* parseOpenAiSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AdapterEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state: OpenAiStreamParseState = {
    finishReason: "stop",
    usage: null,
    toolCalls: null,
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          yield {
            type: "done",
            finish_reason: state.finishReason,
            usage: state.usage,
          };
          return;
        }
        try {
          const json = JSON.parse(data) as Record<string, unknown>;
          if (json.usage) {
            state.usage = mapUsage(json.usage as Record<string, unknown>);
          }
          const choices = json.choices as Array<Record<string, unknown>> | undefined;
          const choice = choices?.[0];
          if (!choice) continue;
          const delta = choice.delta as Record<string, unknown> | undefined;
          if (typeof choice.finish_reason === "string" && choice.finish_reason) {
            state.finishReason = choice.finish_reason;
          }
          if (delta?.content && typeof delta.content === "string") {
            yield { type: "delta", content: delta.content };
          }
          if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
            state.toolCalls = delta.tool_calls;
            yield { type: "tool_calls", tool_calls: delta.tool_calls };
          }
        } catch {
          throw new ProviderError("Failed to parse SSE chunk", "bad_response");
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {
    type: "done",
    finish_reason: state.finishReason,
    usage: state.usage,
  };
}

export function openAiCompatAdapter(config: OpenAiCompatConfig): ProviderAdapter {
  const base = config.baseUrl.replace(/\/$/, "");

  return {
    async complete(req: AdapterRequest & { stream: false }): Promise<AdapterCompletion> {
      const apiKey = getApiKey(config.apiKeyEnv);
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildOpenAiBody({ ...req, stream: false })),
        signal: req.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new ProviderError(text || res.statusText, "http_error", res.status);
      }
      const json = (await res.json()) as Record<string, unknown>;
      const choices = json.choices as Array<Record<string, unknown>> | undefined;
      const choice = choices?.[0];
      if (!choice) {
        throw new ProviderError("No choices in response", "bad_response");
      }
      const message = choice.message as Record<string, unknown> | undefined;
      const content = typeof message?.content === "string" ? message.content : "";
      const tool_calls = message?.tool_calls as unknown[] | undefined;
      const finish_reason =
        typeof choice.finish_reason === "string" ? choice.finish_reason : "stop";
      return {
        content,
        ...(tool_calls ? { tool_calls } : {}),
        finish_reason,
        usage: mapUsage(json.usage as Record<string, unknown> | undefined),
      };
    },

    async *stream(req: AdapterRequest & { stream: true }): AsyncGenerator<AdapterEvent> {
      const apiKey = getApiKey(config.apiKeyEnv);
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildOpenAiBody({ ...req, stream: true })),
        signal: req.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new ProviderError(text || res.statusText, "http_error", res.status);
      }
      if (!res.body) {
        throw new ProviderError("Empty response body", "bad_response");
      }
      yield* parseOpenAiSseStream(res.body);
    },
  };
}
