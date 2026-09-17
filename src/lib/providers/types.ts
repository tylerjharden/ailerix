export type AdapterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; [k: string]: unknown }>;
  tool_call_id?: string;
  tool_calls?: unknown[];
};

export type AdapterRequest = {
  providerModelId: string;
  messages: AdapterMessage[];
  stream: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
  reasoning_effort?: string;
  signal?: AbortSignal;
};

export type AdapterUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens?: number;
};

export type AdapterEvent =
  | { type: "delta"; content: string }
  | { type: "tool_calls"; tool_calls: unknown[] }
  | { type: "done"; finish_reason: string; usage: AdapterUsage | null };

export type AdapterCompletion = {
  content: string;
  tool_calls?: unknown[];
  finish_reason: string;
  usage: AdapterUsage | null;
};

export type ProviderAdapter = {
  complete(req: AdapterRequest & { stream: false }): Promise<AdapterCompletion>;
  stream(req: AdapterRequest & { stream: true }): AsyncGenerator<AdapterEvent>;
};

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: "missing_key" | "http_error" | "timeout" | "bad_response",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
