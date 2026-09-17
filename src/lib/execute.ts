import { loadSnapshot } from "@/lib/aa/load";
import type { AaModelSnapshot } from "@/lib/aa/types";
import { bindingFor } from "@/lib/providers/registry";
import type {
  AdapterEvent,
  AdapterMessage,
  AdapterRequest,
  AdapterUsage,
} from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/types";
import type { RouteDecision } from "@/lib/router";

const EXECUTION_TIMEOUT_MS = 60_000;

export type ExecuteParams = {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
  reasoning?: { effort?: string };
  logit_bias?: unknown;
  seed?: unknown;
};

export type ExecutionJsonResult = {
  kind: "json";
  content: string;
  tool_calls?: unknown[];
  finish_reason: string;
  usage: AdapterUsage | null;
  executedSlug: string;
  executedAaId: string;
  fallbackUsed: boolean;
  ttftMs: number | null;
  totalMs: number;
  droppedParams: string[];
  estimatedTurnUsd: number | null;
};

export type ExecutionStreamDone = {
  content: string;
  tool_calls?: unknown[];
  finish_reason: string;
  usage: AdapterUsage | null;
  executedSlug: string;
  executedAaId: string;
  fallbackUsed: boolean;
  ttftMs: number | null;
  totalMs: number;
  droppedParams: string[];
  estimatedTurnUsd: number | null;
};

export type ExecutionStreamResult = {
  kind: "stream";
  events: AsyncGenerator<AdapterEvent>;
  onDone: Promise<ExecutionStreamDone>;
};

export type ExecutionResult = ExecutionJsonResult | ExecutionStreamResult;

export class ProviderUnavailableError extends Error {
  readonly error_type = "provider_unavailable" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

function snapshotModel(aaId: string): AaModelSnapshot | undefined {
  return loadSnapshot().models.find((m) => m.aa_id === aaId);
}

export function estimatedTurnUsd(
  model: AaModelSnapshot,
  usage: AdapterUsage | null,
): number | null {
  if (!usage) return null;
  return (
    (usage.prompt_tokens * model.input_per_mtok_usd +
      usage.completion_tokens * model.output_per_mtok_usd) /
    1_000_000
  );
}

function collectDroppedParams(params: ExecuteParams): string[] {
  const dropped: string[] = [];
  if (params.logit_bias !== undefined) dropped.push("logit_bias");
  if (params.seed !== undefined) dropped.push("seed");
  return dropped;
}

function buildAdapterRequest(
  providerModelId: string,
  messages: AdapterMessage[],
  stream: boolean,
  params: ExecuteParams,
  signal: AbortSignal,
): AdapterRequest {
  const maxTokens = params.max_tokens ?? params.max_completion_tokens;
  const req: AdapterRequest = {
    providerModelId,
    messages,
    stream,
    signal,
  };
  if (params.temperature !== undefined) req.temperature = params.temperature;
  if (params.top_p !== undefined) req.top_p = params.top_p;
  if (maxTokens !== undefined) req.max_tokens = maxTokens;
  if (params.stop !== undefined) req.stop = params.stop;
  if (params.tools !== undefined) req.tools = params.tools;
  if (params.tool_choice !== undefined) req.tool_choice = params.tool_choice;
  if (params.response_format !== undefined) {
    req.response_format = params.response_format;
  }
  if (params.reasoning?.effort !== undefined) {
    req.reasoning_effort = params.reasoning.effort;
  }
  return req;
}

type AttemptTarget = {
  slug: string;
  providerModelId: string;
  aaId: string;
};

async function runComplete(
  target: AttemptTarget,
  messages: AdapterMessage[],
  params: ExecuteParams,
): Promise<{
  completion: {
    content: string;
    tool_calls?: unknown[];
    finish_reason: string;
    usage: AdapterUsage | null;
  };
  ttftMs: number | null;
  totalMs: number;
}> {
  const binding = bindingFor(target.slug);
  if (!binding) {
    throw new ProviderError(`No binding for ${target.slug}`, "bad_response");
  }

  const started = Date.now();
  const signal = AbortSignal.timeout(EXECUTION_TIMEOUT_MS);
  const req = {
    ...buildAdapterRequest(
      target.providerModelId,
      messages,
      false,
      params,
      signal,
    ),
    stream: false as const,
  };

  try {
    const result = await binding.adapter.complete(req);
    const totalMs = Date.now() - started;
    return {
      completion: result,
      ttftMs: totalMs,
      totalMs,
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ProviderError("Provider request timed out", "timeout");
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("Provider request aborted", "timeout");
    }
    throw error;
  }
}

function runStream(
  target: AttemptTarget,
  messages: AdapterMessage[],
  params: ExecuteParams,
  fallbackUsed: boolean,
): ExecutionStreamResult {
  const binding = bindingFor(target.slug);
  if (!binding) {
    throw new ProviderError(`No binding for ${target.slug}`, "bad_response");
  }

  const droppedParams = collectDroppedParams(params);
  const signal = AbortSignal.timeout(EXECUTION_TIMEOUT_MS);
  const req = {
    ...buildAdapterRequest(
      target.providerModelId,
      messages,
      true,
      params,
      signal,
    ),
    stream: true as const,
  };

  const started = Date.now();
  let ttftMs: number | null = null;
  let content = "";
  let tool_calls: unknown[] | undefined;
  let finish_reason = "stop";
  let usage: AdapterUsage | null = null;

  let resolveDone!: (value: ExecutionStreamDone) => void;
  let rejectDone!: (reason: unknown) => void;
  const onDone = new Promise<ExecutionStreamDone>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const events = (async function* (): AsyncGenerator<AdapterEvent> {
    try {
      for await (const event of binding.adapter.stream(req)) {
        if (event.type === "delta") {
          if (ttftMs === null) ttftMs = Date.now() - started;
          content += event.content;
          yield event;
        } else if (event.type === "tool_calls") {
          tool_calls = event.tool_calls;
          yield event;
        } else if (event.type === "done") {
          finish_reason = event.finish_reason;
          usage = event.usage;
          yield event;
          const totalMs = Date.now() - started;
          const model = snapshotModel(target.aaId);
          resolveDone({
            content,
            tool_calls,
            finish_reason,
            usage,
            executedSlug: target.slug,
            executedAaId: target.aaId,
            fallbackUsed,
            ttftMs,
            totalMs,
            droppedParams,
            estimatedTurnUsd: model ? estimatedTurnUsd(model, usage) : null,
          });
        } else {
          const _exhaustive: never = event;
          throw new Error(`Unknown adapter event: ${String(_exhaustive)}`);
        }
      }
    } catch (error) {
      rejectDone(error);
      if (error instanceof ProviderError) throw error;
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new ProviderError("Provider request timed out", "timeout");
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError("Provider request aborted", "timeout");
      }
      throw error;
    }
  })();

  return { kind: "stream", events, onDone };
}

function isProviderFailure(error: unknown): boolean {
  return (
    error instanceof ProviderError ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function executeRoute(input: {
  decision: RouteDecision;
  messages: AdapterMessage[];
  stream: boolean;
  params: ExecuteParams;
  revealed?: boolean;
}): Promise<ExecutionResult> {
  const { decision, messages, stream, params } = input;
  const droppedParams = collectDroppedParams(params);

  const pick: AttemptTarget = {
    slug: decision.providerSlug,
    providerModelId: decision.providerModelId,
    aaId: decision.aaId,
  };
  const fallback: AttemptTarget = {
    slug: decision.fallbackProviderSlug,
    providerModelId: decision.fallbackProviderModelId,
    aaId: decision.fallbackAaId,
  };

  if (stream) {
    try {
      const primary = runStream(pick, messages, params, false);
      return primary;
    } catch (primaryError) {
      if (!isProviderFailure(primaryError)) throw primaryError;
      try {
        return runStream(fallback, messages, params, true);
      } catch {
        throw new ProviderUnavailableError(
          "Primary and fallback providers failed",
        );
      }
    }
  }

  try {
    const result = await runComplete(pick, messages, params);
    const model = snapshotModel(pick.aaId);
    return {
      kind: "json",
      content: result.completion.content,
      tool_calls: result.completion.tool_calls,
      finish_reason: result.completion.finish_reason,
      usage: result.completion.usage,
      executedSlug: pick.slug,
      executedAaId: pick.aaId,
      fallbackUsed: false,
      ttftMs: result.ttftMs,
      totalMs: result.totalMs,
      droppedParams,
      estimatedTurnUsd: model
        ? estimatedTurnUsd(model, result.completion.usage)
        : null,
    };
  } catch (primaryError) {
    if (!isProviderFailure(primaryError)) throw primaryError;
    try {
      const result = await runComplete(fallback, messages, params);
      const model = snapshotModel(fallback.aaId);
      return {
        kind: "json",
        content: result.completion.content,
        tool_calls: result.completion.tool_calls,
        finish_reason: result.completion.finish_reason,
        usage: result.completion.usage,
        executedSlug: fallback.slug,
        executedAaId: fallback.aaId,
        fallbackUsed: true,
        ttftMs: result.ttftMs,
        totalMs: result.totalMs,
        droppedParams,
        estimatedTurnUsd: model
          ? estimatedTurnUsd(model, result.completion.usage)
          : null,
      };
    } catch {
      throw new ProviderUnavailableError(
        "Primary and fallback providers failed",
      );
    }
  }
}
