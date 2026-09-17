import {
  ProviderError,
  type AdapterCompletion,
  type AdapterEvent,
  type AdapterRequest,
  type AdapterUsage,
  type ProviderAdapter,
} from "@/lib/providers/types";

type GoogleConfig = {
  apiKeyEnv: string;
  fallbackApiKeyEnv?: string;
};

function resolveApiKey(config: GoogleConfig): string {
  const primary = process.env[config.apiKeyEnv];
  if (primary && primary.trim() !== "") return primary;
  if (config.fallbackApiKeyEnv) {
    const fallback = process.env[config.fallbackApiKeyEnv];
    if (fallback && fallback.trim() !== "") return fallback;
  }
  throw new ProviderError(
    `Missing API key: set ${config.apiKeyEnv}${config.fallbackApiKeyEnv ? ` or ${config.fallbackApiKeyEnv}` : ""}`,
    "missing_key",
  );
}

function mapFinishReason(reason: string | undefined): string {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
    case "OTHER":
      return "stop";
    default:
      return "stop";
  }
}

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

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function toGeminiParts(
  content: string | Array<{ type: string; [k: string]: unknown }>,
): GeminiPart[] {
  if (typeof content === "string") {
    return content ? [{ text: content }] : [];
  }
  const parts: GeminiPart[] = [];
  for (const part of content) {
    if (part.type === "text" && typeof part.text === "string") {
      parts.push({ text: part.text });
      continue;
    }
    if (part.type === "image_url" && typeof part.image_url === "object") {
      const urlObj = part.image_url as Record<string, unknown>;
      const url = typeof urlObj.url === "string" ? urlObj.url : "";
      const dataMatch = /^data:([^;]+);base64,(.+)$/.exec(url);
      if (dataMatch) {
        parts.push({
          inlineData: { mimeType: dataMatch[1], data: dataMatch[2] },
        });
        continue;
      }
    }
    const text = flattenText([part]);
    if (text) parts.push({ text });
  }
  return parts;
}

function buildGeminiBody(req: AdapterRequest): Record<string, unknown> {
  let systemInstruction: { parts: GeminiPart[] } | undefined;
  const contents: Array<{ role: string; parts: GeminiPart[] }> = [];

  for (const msg of req.messages) {
    if (msg.role === "system") {
      const parts = toGeminiParts(msg.content);
      if (parts.length) {
        systemInstruction = systemInstruction
          ? {
              parts: [...systemInstruction.parts, ...parts],
            }
          : { parts };
      }
      continue;
    }
    const role = msg.role === "assistant" ? "model" : "user";
    const parts = toGeminiParts(msg.content);
    if (parts.length === 0) continue;
    contents.push({ role, parts });
  }

  const generationConfig: Record<string, unknown> = {};
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.top_p !== undefined) generationConfig.topP = req.top_p;
  if (req.max_tokens !== undefined) generationConfig.maxOutputTokens = req.max_tokens;
  if (req.stop !== undefined) {
    generationConfig.stopSequences = Array.isArray(req.stop) ? req.stop : [req.stop];
  }

  const body: Record<string, unknown> = { contents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }
  return body;
}

function mapUsageMetadata(raw: Record<string, unknown> | undefined): AdapterUsage | null {
  if (!raw) return null;
  const reasoning =
    typeof raw.thoughtsTokenCount === "number" ? raw.thoughtsTokenCount : undefined;
  return {
    prompt_tokens:
      typeof raw.promptTokenCount === "number" ? raw.promptTokenCount : 0,
    completion_tokens:
      typeof raw.candidatesTokenCount === "number" ? raw.candidatesTokenCount : 0,
    ...(reasoning !== undefined ? { reasoning_tokens: reasoning } : {}),
  };
}

function extractFromGeminiResponse(json: Record<string, unknown>): {
  content: string;
  finish_reason: string;
  usage: AdapterUsage | null;
} {
  const candidates = json.candidates as Array<Record<string, unknown>> | undefined;
  const candidate = candidates?.[0];
  const contentObj = candidate?.content as { parts?: GeminiPart[] } | undefined;
  const text =
    contentObj?.parts
      ?.map((p) => ("text" in p ? p.text : ""))
      .join("") ?? "";
  const finish_reason = mapFinishReason(
    typeof candidate?.finishReason === "string" ? candidate.finishReason : undefined,
  );
  const usage = mapUsageMetadata(
    json.usageMetadata as Record<string, unknown> | undefined,
  );
  return { content: text, finish_reason, usage };
}

async function* parseGeminiSseStream(
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
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        let data = trimmed;
        if (trimmed.startsWith("data:")) data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as Record<string, unknown>;
          const extracted = extractFromGeminiResponse(json);
          if (extracted.content) {
            yield { type: "delta", content: extracted.content };
          }
          finishReason = extracted.finish_reason;
          if (extracted.usage) usage = extracted.usage;
        } catch {
          throw new ProviderError("Failed to parse Gemini SSE", "bad_response");
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: "done", finish_reason: finishReason, usage };
}

export function googleAdapter(config: GoogleConfig): ProviderAdapter {
  return {
    async complete(req: AdapterRequest & { stream: false }): Promise<AdapterCompletion> {
      const apiKey = resolveApiKey(config);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.providerModelId)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildGeminiBody({ ...req, stream: false })),
        signal: req.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new ProviderError(text || res.statusText, "http_error", res.status);
      }
      const json = (await res.json()) as Record<string, unknown>;
      const { content, finish_reason, usage } = extractFromGeminiResponse(json);
      return { content, finish_reason, usage };
    },

    async *stream(req: AdapterRequest & { stream: true }): AsyncGenerator<AdapterEvent> {
      const apiKey = resolveApiKey(config);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.providerModelId)}:streamGenerateContent?alt=sse`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildGeminiBody({ ...req, stream: true })),
        signal: req.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new ProviderError(text || res.statusText, "http_error", res.status);
      }
      if (!res.body) {
        throw new ProviderError("Empty response body", "bad_response");
      }
      yield* parseGeminiSseStream(res.body);
    },
  };
}
