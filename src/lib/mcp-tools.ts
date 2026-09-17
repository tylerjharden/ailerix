import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "@modelcontextprotocol/server";
import {
  createMcpHandler,
  experimental_withMcpAuth,
} from "mcp-handler";
import { z } from "zod";

import { getEvent, recordEvent, summarize } from "@/lib/analytics/store";
import type { RouteEventInput, StoredRouteEvent } from "@/lib/analytics/types";
import { authEnabled } from "@/lib/auth-config";
import {
  ensureAccount,
  getBalance,
  getUsageUsd,
  insufficientCreditsForExecution,
  SIGNUP_GRANT_USD,
  usageDebitUsd,
  debitCredits,
} from "@/lib/credits";
import { executeRoute, ProviderUnavailableError } from "@/lib/execute";
import { isRoutingPolicy, type RoutingPolicy } from "@/lib/models";
import { AILERIX_AUTO_MODEL_ID, routeRequest, type RouteDecision } from "@/lib/router";
import {
  appBaseUrl,
  creditPackById,
  getStripe,
  isCreditPackId,
  stripeEnabled,
} from "@/lib/stripe";
import { TASK_FAMILIES, type TaskFamily } from "@/lib/families";

const policySchema = z.enum(["balanced", "cheap", "quality", "latency"]).optional();

export const MCP_TOOL_NAMES = [
  "route_preview",
  "create_completion",
  "get_generation",
  "analytics_summary",
  "credit_balance",
  "buy_credits",
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export function mcpOAuthEnabled(): boolean {
  return authEnabled() && Boolean(process.env.CLERK_SECRET_KEY);
}

function mcpTextResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function signInRequired(message: string) {
  return mcpTextResult({ sign_in_required: true, message });
}

function clerkUserIdFromContext(ctx: ServerContext): string | undefined {
  const extra = ctx.http?.authInfo?.extra;
  if (extra && typeof extra.userId === "string" && extra.userId.length > 0) {
    return extra.userId;
  }
  return undefined;
}

function coercePolicy(policy?: string): RoutingPolicy {
  if (policy && isRoutingPolicy(policy)) {
    return policy;
  }
  return "balanced";
}

function qualityFloorScore(decision: RouteDecision): number {
  const answer = decision.decisions.answers.quality_floor;
  return answer?.type === "score" ? answer.score : 0;
}

function ailerixTrace(
  decision: RouteDecision,
  execution: {
    executed: boolean;
    estimated_turn_usd: number | null;
    fallback_used: boolean;
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
    degraded: decision.degraded,
    executed: execution.executed,
    estimated_turn_usd: execution.estimated_turn_usd,
    fallback_used: execution.fallback_used,
  };
}

function toPublicGeneration(event: StoredRouteEvent) {
  return {
    id: event.generationId,
    created_at: Math.floor(event.createdAt.getTime() / 1000),
    endpoint: event.endpoint,
    policy: event.policy,
    engine: event.engine,
    family: event.family,
    family_confidence: event.familyConfidence,
    quality_floor: event.qualityFloor,
    mapped_floor: event.mappedFloor,
    aa_id: event.aaId,
    fallback_aa_id: event.fallbackAaId,
    next_up_used: event.nextUpUsed,
    degraded: event.degraded,
    executed: event.executed,
    status: event.status,
    latency: {
      jev_ms: event.jevMs,
      walk_ms: event.walkMs,
      provider_ttft_ms: event.providerTtftMs,
      provider_total_ms: event.providerTotalMs,
      total_ms: event.totalMs,
    },
    usage: {
      prompt_tokens: event.promptTokens,
      completion_tokens: event.completionTokens,
      reasoning_tokens: event.reasoningTokens,
    },
    cost: {
      cost_per_task_usd: event.costPerTaskUsd,
      estimated_turn_usd: event.estimatedTurnUsd,
    },
  };
}

export async function handleRoutePreview(input: {
  prompt: string;
  policy?: string;
}) {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error("prompt is required");
  }
  const decision = await routeRequest({
    state: {
      messages: [{ role: "user", content: prompt }],
      requested_model: AILERIX_AUTO_MODEL_ID,
    },
    policy: coercePolicy(input.policy),
  });
  return {
    model: AILERIX_AUTO_MODEL_ID,
    family: decision.family,
    family_confidence: decision.familyConfidence,
    aa_id: decision.aaId,
    cost_per_task_usd: decision.costPerTaskUsd,
    floor: decision.floor,
    fallback_aa_id: decision.fallbackAaId,
    next_up_used: decision.nextUpUsed,
    degraded: decision.degraded,
    policy: decision.policy,
    reasons: decision.reasons,
  };
}

async function resolveMcpAccount(
  ctx: ServerContext,
): Promise<{ accountId: string } | "sign_in" | "anonymous"> {
  if (mcpOAuthEnabled()) {
    const userId = clerkUserIdFromContext(ctx);
    if (!userId) {
      return "sign_in";
    }
    const account = await ensureAccount(userId);
    if (!account) {
      return "sign_in";
    }
    return { accountId: account.id };
  }
  if (!authEnabled()) {
    return "anonymous";
  }
  return "sign_in";
}

function buildMcpRouteEvent(input: {
  generationId: string;
  decision: RouteDecision;
  accountId?: string | null;
  status: RouteEventInput["status"];
  executed: boolean;
  totalMs: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  estimatedTurnUsd?: number | null;
  providerTtftMs?: number | null;
  providerTotalMs?: number | null;
  errorCode?: string | null;
}): RouteEventInput {
  const { decision } = input;
  return {
    generationId: input.generationId,
    endpoint: "mcp",
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
    revealed: false,
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
    accountId: input.accountId ?? null,
    apiKeyId: null,
    anonId: null,
  };
}

export async function handleCreateCompletion(
  input: { prompt: string; policy?: string },
  ctx: ServerContext,
) {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error("prompt is required");
  }

  let accountId: string | null = null;
  if (mcpOAuthEnabled()) {
    const accountResolution = await resolveMcpAccount(ctx);
    if (accountResolution === "sign_in") {
      return signInRequired("Sign in with OAuth to run completions when Clerk MCP auth is enabled.");
    }
    if (typeof accountResolution === "object") {
      accountId = accountResolution.accountId;
    }
  }

  const policy = coercePolicy(input.policy);
  const requestStarted = Date.now();
  const generationId = `gen_${crypto.randomUUID()}`;

  const decision = await routeRequest({
    state: {
      messages: [{ role: "user", content: prompt }],
      requested_model: AILERIX_AUTO_MODEL_ID,
    },
    policy,
  });

  if (accountId) {
    const blocked = await insufficientCreditsForExecution(
      accountId,
      decision.aaId,
      decision.costPerTaskUsd,
    );
    if (blocked) {
      return mcpTextResult({
        error: "insufficient_credits",
        message: "Insufficient credits. Top up your balance to continue.",
        generation_id: generationId,
      });
    }
  }

  const adapterMessages = [{ role: "user" as const, content: prompt }];

  try {
    const execution = await executeRoute({
      decision,
      messages: adapterMessages,
      stream: false,
      params: {},
      revealed: false,
    });

    if (execution.kind !== "json") {
      throw new Error("Expected non-stream execution result");
    }

    const totalMs = Date.now() - requestStarted;
    void recordEvent(
      buildMcpRouteEvent({
        generationId,
        decision,
        accountId,
        status: execution.fallbackUsed ? "fallback_used" : "ok",
        executed: true,
        totalMs,
        promptTokens: execution.usage?.prompt_tokens ?? null,
        completionTokens: execution.usage?.completion_tokens ?? null,
        reasoningTokens: execution.usage?.reasoning_tokens ?? null,
        estimatedTurnUsd: execution.estimatedTurnUsd,
        providerTtftMs: execution.ttftMs,
        providerTotalMs: execution.totalMs,
      }),
    );

    if (accountId && execution.estimatedTurnUsd !== null) {
      const debit = usageDebitUsd(execution.estimatedTurnUsd);
      if (debit > 0) {
        void debitCredits({
          accountId,
          usd: debit,
          reason: "usage_debit",
          ref: generationId,
        });
      }
    }

    return mcpTextResult({
      id: generationId,
      model: AILERIX_AUTO_MODEL_ID,
      content: execution.content,
      finish_reason: execution.finish_reason,
      usage: execution.usage,
      ailerix: ailerixTrace(decision, {
        executed: true,
        estimated_turn_usd: execution.estimatedTurnUsd,
        fallback_used: execution.fallbackUsed,
      }),
    });
  } catch (error) {
    const totalMs = Date.now() - requestStarted;
    if (error instanceof ProviderUnavailableError) {
      void recordEvent(
        buildMcpRouteEvent({
          generationId,
          decision,
          accountId,
          status: "provider_error",
          executed: false,
          totalMs,
          errorCode: "provider_unavailable",
        }),
      );
      return mcpTextResult({
        error: "provider_unavailable",
        message: error.message,
        generation_id: generationId,
      });
    }
    throw error;
  }
}

export function registerAilerixMcpTools(server: McpServer): void {
  server.registerTool(
    "route_preview",
    {
      title: "Route preview",
      description:
        "Classify a prompt and return the frontier routing decision without executing a provider completion.",
      inputSchema: z.object({
        prompt: z.string().describe("User task text to route."),
        policy: policySchema.describe("Optional routing policy hint."),
      }),
    },
    async ({ prompt, policy }) => mcpTextResult(await handleRoutePreview({ prompt, policy })),
  );

  server.registerTool(
    "create_completion",
    {
      title: "Create completion",
      description:
        "Run a routed chat completion (non-streaming) and return assistant content plus the ailerix trace.",
      inputSchema: z.object({
        prompt: z.string().describe("User message text."),
        policy: policySchema,
      }),
    },
    async ({ prompt, policy }, ctx) =>
      handleCreateCompletion({ prompt, policy }, ctx),
  );

  server.registerTool(
    "get_generation",
    {
      title: "Get generation",
      description:
        "Fetch a persisted route event by generation id (from X-Ailerix-Generation-Id or completion id).",
      inputSchema: z.object({
        generation_id: z.string().describe("gen_ UUID from a prior response."),
      }),
    },
    async ({ generation_id }) => {
      const event = await getEvent(generation_id);
      if (!event) {
        return mcpTextResult({ error: "not_found", message: "Generation not found." });
      }
      return mcpTextResult({ data: toPublicGeneration(event) });
    },
  );

  server.registerTool(
    "analytics_summary",
    {
      title: "Analytics summary",
      description:
        "Aggregate routing analytics (requests, spend, latency percentiles, family breakdown).",
      inputSchema: z.object({
        days: z.union([z.literal(7), z.literal(30)]).optional().describe("Rolling window length."),
      }),
    },
    async ({ days }) => mcpTextResult(await summarize({ days: days ?? 7 })),
  );

  server.registerTool(
    "credit_balance",
    {
      title: "Credit balance",
      description:
        "Return USD balance and usage for the authenticated account, or anonymous tier status when auth is disabled.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      const accountResolution = await resolveMcpAccount(ctx);
      if (accountResolution === "anonymous") {
        return mcpTextResult({ anonymous: true });
      }
      if (accountResolution === "sign_in") {
        return signInRequired("Sign in with OAuth to view credit balance.");
      }
      const balance = (await getBalance(accountResolution.accountId)) ?? 0;
      const usageUsd = await getUsageUsd(accountResolution.accountId);
      return mcpTextResult({
        balance_usd: balance,
        usage_usd: usageUsd,
        is_free_tier: balance <= SIGNUP_GRANT_USD,
      });
    },
  );

  server.registerTool(
    "buy_credits",
    {
      title: "Buy credits",
      description:
        "Start a Stripe checkout session for a credit pack and return the hosted checkout URL.",
      inputSchema: z.object({
        pack: z.enum(["CREDITS-5", "CREDITS-20", "CREDITS-100"]),
      }),
    },
    async ({ pack }, ctx) => {
      const accountResolution = await resolveMcpAccount(ctx);
      if (accountResolution === "anonymous") {
        return signInRequired("Sign in with OAuth to purchase credits.");
      }
      if (accountResolution === "sign_in") {
        return signInRequired("Sign in with OAuth to purchase credits.");
      }
      if (!stripeEnabled()) {
        return mcpTextResult({
          error: "stripe_not_configured",
          message: "Stripe is not configured.",
        });
      }
      if (!isCreditPackId(pack)) {
        return mcpTextResult({ error: "invalid_request", message: "Unknown credit pack." });
      }
      const creditPack = creditPackById(pack);
      if (!creditPack) {
        return mcpTextResult({ error: "invalid_request", message: "Unknown credit pack." });
      }

      const request = ctx.http?.req;
      const base = request ? appBaseUrl(request) : appBaseUrl(new Request("http://localhost"));
      const stripe = getStripe();

      try {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          metadata: {
            accountId: accountResolution.accountId,
            pack: creditPack.id,
          },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: Math.round(creditPack.usd * 100),
                product_data: {
                  name: creditPack.title,
                  description: `${creditPack.usd.toFixed(2)} USD in Ailerix API credits`,
                },
              },
            },
          ],
          success_url: `${base}/dashboard?tab=credits&status=success`,
          cancel_url: `${base}/dashboard?tab=credits&status=cancelled`,
        });
        if (!session.url) {
          return mcpTextResult({
            error: "server_error",
            message: "Could not create checkout session.",
          });
        }
        return mcpTextResult({ checkout_url: session.url });
      } catch {
        return mcpTextResult({
          error: "server_error",
          message: "Could not create checkout session.",
        });
      }
    },
  );
}

export function createAilerixMcpHandler(): (request: Request) => Promise<Response> {
  const inner = createMcpHandler(
    (server) => {
      registerAilerixMcpTools(server);
    },
    {
      serverInfo: {
        name: "ailerix",
        version: "1.0.0",
      },
    },
  );

  if (!mcpOAuthEnabled()) {
    return inner;
  }

  return experimental_withMcpAuth(
    inner,
    async (_req, bearerToken) => {
      const authData = await auth({ acceptsToken: "oauth_token" });
      return verifyClerkToken(authData, bearerToken);
    },
    {
      required: false,
      resourceMetadataPath: "/.well-known/oauth-protected-resource",
    },
  );
}

export function isTaskFamilyValue(value: string): value is TaskFamily {
  return (TASK_FAMILIES as readonly string[]).includes(value);
}
