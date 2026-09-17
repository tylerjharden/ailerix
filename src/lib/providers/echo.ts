import type {
  AdapterCompletion,
  AdapterEvent,
  AdapterMessage,
  AdapterRequest,
  AdapterUsage,
  ProviderAdapter,
} from "@/lib/providers/types";

const ECHO_PREFIX = "[echo-local] ";
const MAX_USER_CHARS = 600;

function lastUserText(messages: AdapterMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    if (typeof msg.content === "string") {
      return msg.content.slice(0, MAX_USER_CHARS);
    }
    const parts = msg.content
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string);
    const joined = parts.join("");
    if (joined) return joined.slice(0, MAX_USER_CHARS);
  }
  return "";
}

function estimateUsage(messages: AdapterMessage[], completion: string): AdapterUsage {
  const promptChars = messages.reduce((sum, m) => {
    if (typeof m.content === "string") return sum + m.content.length;
    return (
      sum +
      m.content.reduce((s, p) => {
        if (p.type === "text" && typeof p.text === "string") return s + p.text.length;
        return s;
      }, 0)
    );
  }, 0);
  const completionChars = completion.length;
  const prompt_tokens = Math.ceil(promptChars / 4);
  const completion_tokens = Math.ceil(completionChars / 4);
  return { prompt_tokens, completion_tokens };
}

function splitIntoChunks(text: string, count: number): string[] {
  if (text.length === 0) return Array(count).fill("");
  const size = Math.ceil(text.length / count);
  const chunks: string[] = [];
  for (let i = 0; i < count; i++) {
    chunks.push(text.slice(i * size, (i + 1) * size));
  }
  return chunks;
}

export const echoAdapter: ProviderAdapter = {
  async complete(req: AdapterRequest & { stream: false }): Promise<AdapterCompletion> {
    const userText = lastUserText(req.messages);
    const content = ECHO_PREFIX + userText;
    const usage = estimateUsage(req.messages, content);
    return {
      content,
      finish_reason: "stop",
      usage,
    };
  },

  async *stream(req: AdapterRequest & { stream: true }): AsyncGenerator<AdapterEvent> {
    const userText = lastUserText(req.messages);
    const content = ECHO_PREFIX + userText;
    const chunks = splitIntoChunks(content, 3);
    for (const chunk of chunks) {
      if (chunk) yield { type: "delta", content: chunk };
    }
    const usage = estimateUsage(req.messages, content);
    yield { type: "done", finish_reason: "stop", usage };
  },
};
