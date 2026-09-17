import {
  ProviderError,
  type AdapterCompletion,
  type AdapterEvent,
  type AdapterMessage,
  type AdapterRequest,
  type AdapterUsage,
  type ProviderAdapter,
} from "@/lib/providers/types";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

type AnthropicConfig = {
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

function mapStopReason(stop: string | undefined): string {
  switch (stop) {
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    case "stop_sequence":
      return "stop";
    default:
      return stop ?? "stop";
  }
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: Record<string, unknown> }
  | { type: "tool_use"; id: string; name: string; input: unknown };

function flattenText(
  content: string | Array<{ type: string; [k: string]: unknown }>,
): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => {
      if (p.type === "text" && typeof p.text === "string") return p.text;
      return "";
    })
    .join("");
}

function toAnthropicContent(
  content: string | Array<{ type: string; [k: string]: unknown }>,
): AnthropicContentBlock[] {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }
  const blocks: AnthropicContentBlock[] = [];
  for (const part of content) {
    if (part.type === "text" && typeof part.text === "string") {
      blocks.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type === "image_url" && typeof part.image_url === "object") {
      const urlObj = part.image_url as Record<string, unknown>;
      const url = typeof urlObj.url === "string" ? urlObj.url : "";
      if (url.startsWith("data:")) {
        const match = /^data:([^;]+);base64,(.+)$/.exec(url);
        if (match) {
          blocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: match[1],
              data: match[2],
            },
          });
          continue;
        }
      }
      if (url) {
        blocks.push({
          type: "image",
          source: { type: "url", url },
        });
        continue;
      }
    }
    blocks.push({ type: "text", text: flattenText([part]) || JSON.stringify(part) });
  }
  return blocks;
}

function mapOpenAiToolsToAnthropic(tools: unknown[]): Array<{
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}> {
  return tools.map((tool) => {
    const t = tool as Record<string, unknown>;
    if (t.type === "function" && typeof t.function === "object") {
      const fn = t.function as Record<string, unknown>;
      return {
        name: String(fn.name ?? ""),
        description:
          typeof fn.description === "string" ? fn.description : undefined,
        input_schema:
          typeof fn.parameters === "object" && fn.parameters !== null
            ? (fn.parameters as Record<string, unknown>)
            : { type: "object", properties: {} },
      };
    }
    return {
      name: String(t.name ?? "tool"),
      description: typeof t.description === "string" ? t.description : undefined,
      input_schema: { type: "object", properties: {} },
    };
  });
}

function buildAnthropicBody(req: AdapterRequest): Record<string, unknown> {
  let system: string | undefined;
  const messages: Array<{ role: "user" | "assistant"; content: AnthropicContentBlock[] }> =
    [];

  for (const msg of req.messages) {
    if (msg.role === "system") {
      const text = flattenText(msg.content);
      system = system ? `${system}\n${text}` : text;
      continue;
    }
    if (msg.role === "tool") {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `[tool result ${msg.tool_call_id ?? ""}]: ${flattenText(msg.content)}`,
          },
        ],
      });
      continue;
    }
    const role = msg.role === "assistant" ? "assistant" : "user";
    const blocks = toAnthropicContent(msg.content);
    if (msg.tool_calls && Array.isArray(msg.tool_calls) && role === "assistant") {
      for (const tc of msg.tool_calls) {
        const call = tc as Record<string, unknown>;
        const fn = call.function as Record<string, unknown> | undefined;
        let input: unknown = {};
        if (typeof fn?.arguments === "string") {
          try {
            input = JSON.parse(fn.arguments);
          } catch {
            input = {};
          }
        }
        blocks.push({
          type: "tool_use",
          id: String(call.id ?? ""),
          name: String(fn?.name ?? ""),
          input,
        });
      }
    }
    messages.push({ role, content: blocks });
  }

  const body: Record<string, unknown> = {
    model: req.providerModelId,
    max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS,
    messages,
  };
  if (system) body.system = system;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.top_p !== undefined) body.top_p = req.top_p;
  if (req.stop !== undefined) {
    body.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop];
  }
  if (req.tools && req.tools.length > 0) {
    body.tools = mapOpenAiToolsToAnthropic(req.tools);
  }
  return body;
}

function mapUsage(raw: Record<string, unknown> | undefined): AdapterUsage | null {
  if (!raw) return null;
  return {
    prompt_tokens: typeof raw.input_tokens === "number" ? raw.input_tokens : 0,
    completion_tokens:
      typeof raw.output_tokens === "number" ? raw.output_tokens : 0,
  };
}

async function* parseAnthropicSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AdapterEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finishReason = "stop";
  let usage: AdapterUsage | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const lines = part.split("\n");
        let eventType = "";
        let dataLine = "";
        for (const line of lines) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          if (line.startsWith("data:")) dataLine = line.slice(5).trim();
        }
        if (!dataLine) continue;
        try {
          const json = JSON.parse(dataLine) as Record<string, unknown>;
          if (eventType === "content_block_delta") {
            const delta = json.delta as Record<string, unknown> | undefined;
            if (delta?.type === "text_delta" && typeof delta.text === "string") {
              yield { type: "delta", content: delta.text };
            }
          }
          if (eventType === "message_delta") {
            const delta = json.delta as Record<string, unknown> | undefined;
            if (typeof delta?.stop_reason === "string") {
              finishReason = mapStopReason(delta.stop_reason);
            }
            usage = mapUsage(json.usage as Record<string, unknown> | undefined) ?? usage;
          }
        } catch {
          throw new ProviderError("Failed to parse Anthropic SSE", "bad_response");
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: "done", finish_reason: finishReason, usage };
}

export function anthropicAdapter(config: AnthropicConfig): ProviderAdapter {
  return {
    async complete(req: AdapterRequest & { stream: false }): Promise<AdapterCompletion> {
      const apiKey = getApiKey(config.apiKeyEnv);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildAnthropicBody({ ...req, stream: false })),
        signal: req.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new ProviderError(text || res.statusText, "http_error", res.status);
      }
      const json = (await res.json()) as Record<string, unknown>;
      const contentBlocks = json.content as Array<Record<string, unknown>> | undefined;
      const textParts =
        contentBlocks
          ?.filter((b) => b.type === "text" && typeof b.text === "string")
          .map((b) => b.text as string) ?? [];
      const toolBlocks =
        contentBlocks?.filter((b) => b.type === "tool_use") ?? [];
      const tool_calls = toolBlocks.length
        ? toolBlocks.map((b) => ({
            id: b.id,
            type: "function",
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input ?? {}),
            },
          }))
        : undefined;
      const stopReason = mapStopReason(
        typeof json.stop_reason === "string" ? json.stop_reason : undefined,
      );
      return {
        content: textParts.join(""),
        ...(tool_calls ? { tool_calls } : {}),
        finish_reason: stopReason,
        usage: mapUsage(json.usage as Record<string, unknown> | undefined),
      };
    },

    async *stream(req: AdapterRequest & { stream: true }): AsyncGenerator<AdapterEvent> {
      const apiKey = getApiKey(config.apiKeyEnv);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...buildAnthropicBody({ ...req, stream: true }), stream: true }),
        signal: req.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new ProviderError(text || res.statusText, "http_error", res.status);
      }
      if (!res.body) {
        throw new ProviderError("Empty response body", "bad_response");
      }
      yield* parseAnthropicSseStream(res.body);
    },
  };
}
