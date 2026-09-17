import { FAMILY_DESCRIPTIONS, TASK_FAMILIES } from "@/lib/families";

const BASE = "https://ailerix.com";

const MARKDOWN_PAGES: Record<string, string> = {
  index: buildIndex(),
  docs: buildDocs(),
  models: buildModels(),
  playground: buildPlayground(),
  dashboard: buildDashboard(),
};

function buildIndex(): string {
  return `# Ailerix

Ailerix is a routing API for large language models. You never pick a provider model: Jev classifies your task into one of seven **task families**, software walks the Artificial Analysis **cost-per-task Pareto frontier**, and every public call uses the single model id \`ailerix/auto\`.

## Thesis

1. **Jev classifies the task** — typed questions (family, quality floor, cost and latency sensitivity, capability nouls) replace catalog-id choice.
2. **Software walks the frontier** — the cheapest frontier point that clears your quality floor, with optional next-up when confidence or gradient warrants it.
3. **You never name a model** — responses stay on \`ailerix/auto\` unless you explicitly reveal the executed route for debugging.

## Quickstart

\`\`\`bash
curl -s https://ailerix.com/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "ailerix/auto",
    "messages": [{"role": "user", "content": "Summarize our Q3 roadmap for executives."}]
  }'
\`\`\`

Preview routing without execution:

\`\`\`bash
curl -s https://ailerix.com/api/v1/route \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Fix this Python stack trace", "policy": "balanced"}'
\`\`\`

## Discoverability

- Human docs: ${BASE}/docs
- Machine-readable API: ${BASE}/openapi.json
- Agent onboarding: ${BASE}/auth.md
- LLM index: ${BASE}/llms.txt
- MCP server card: ${BASE}/.well-known/mcp/server-card.json

## Markdown mirrors

Send \`Accept: text/markdown\` on ${BASE}/, /docs, /models, /playground, or /dashboard to receive these summaries.
`;
}

function buildDocs(): string {
  return `# Ailerix API usage

Base URL: \`${BASE}/api/v1\`

OpenAPI description: ${BASE}/openapi.json

## Authentication

- **Anonymous**: up to 25 routed requests per UTC day (completions and route). Over the cap → \`429\` with \`rate_limit_exceeded\`.
- **API key**: \`Authorization: Bearer ailerix_…\` from the dashboard. Metered against your credit balance.
- **OAuth (MCP)**: streamable HTTP MCP at \`${BASE}/api/mcp\` uses Clerk when configured. See ${BASE}/auth.md.

## \`ailerix/auto\` contract

- \`POST /api/v1/chat/completions\` — only \`model\` omitted or \`"ailerix/auto"\`. Any other model id → \`400\` \`model_not_allowed\`.
- Forbidden body keys: \`models\`, \`provider\`, \`plugins\`, \`preset\` → \`400\` \`parameter_not_allowed\`.
- Success responses include an \`ailerix\` object: \`family\`, \`family_confidence\`, \`quality_floor\`, \`floor\`, \`cost_per_task_usd\`, \`engine\`, \`policy\`, \`fallback_aa_id\`, \`next_up_used\`, \`executed\`, \`estimated_turn_usd\`, \`fallback_used\`, \`dropped_params\`. Provider slugs are omitted unless you send \`x-ailerix-reveal-route: 1\`.
- Streaming: set \`stream: true\`; response is Server-Sent Events in the OpenAI chunk format, ending with \`data: [DONE]\`. Header \`X-Ailerix-Generation-Id\` on all completion responses.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/v1/chat/completions | Routed chat completion (execute) |
| POST | /api/v1/route | Routing preview + narrative output |
| POST | /api/v1/systemone | Arbitrary System One evaluate passthrough |
| GET | /api/v1/models | Lists only \`ailerix/auto\` |
| GET | /api/v1/generation?id= | Lookup persisted route event by generation id |
| GET | /api/v1/analytics/summary | Aggregate analytics (public) |
| GET | /api/v1/key | API key metadata and balance (bearer required) |

## Payment and rate limits

- **402 Payment Required** — signed-in account with insufficient credits before a billable completion (\`code: insufficient_credits\`, \`metadata.error_type: payment_required\`). Echo-only or zero-cost estimates may still succeed.
- **429 Too Many Requests** — anonymous daily cap exceeded (\`code: rate_limit_exceeded\`).

## Policy hints

Optional \`policy\` on completions and route: \`balanced\` (default), \`cheap\`, \`quality\`, \`latency\`. Unknown values coerce to \`balanced\`.

## Links

- Families reference: ${BASE}/models
- Playground: ${BASE}/playground
- Auth guide for agents: ${BASE}/auth.md
`;
}

function buildModels(): string {
  const familyLines = TASK_FAMILIES.map(
    (f) => `- **${f}** — ${FAMILY_DESCRIPTIONS[f]}`,
  ).join("\n");

  return `# Task families

Ailerix routes by **task family**, not by vendor model name. Jev assigns exactly one family per request; the frontier walker picks the cheapest Artificial Analysis snapshot point that clears your mapped quality floor.

## The seven families

${familyLines}

## How the walk works

1. Eligibility filters (vision, tools, code, context length) shrink the snapshot.
2. Build the cost-per-task Pareto frontier for the family.
3. Map Jev's quality-floor score to a percentile band over eligible models.
4. Pick the cheapest frontier point at or above that floor; optionally step **next up** on low confidence or steep gradient.
5. Latency-sensitive policies may re-pick within a cost band for lower time-to-first-token.

The only public model id remains \`ailerix/auto\`. Internal fixture ids (\`aa_id\`) appear in routing traces for observability.

## Learn more

- API docs: ${BASE}/docs
- OpenAPI: ${BASE}/openapi.json
`;
}

function buildPlayground(): string {
  return `# Playground

The playground at ${BASE}/playground exercises **POST /api/v1/route** with your prompt and an optional **policy hint** (balanced, cheap, quality, latency).

## What it shows

- **Task family** and Jev confidence
- **Quality floor** (score and mapped AA floor)
- **Frontier pick** (\`aa_id\`) and **cost per task**
- **Next-up** indicator when the walker stepped for confidence or gradient
- **Fallback** frontier id
- **Reasons** — human-readable routing explanation (never "Jev picked <vendor>")
- Collapsible raw **decisions** from System One

## What it does not do

There is no model dropdown. You cannot select OpenAI, Anthropic, or OpenRouter slugs in the UI — that is intentional. Use \`ailerix/auto\` via the API for completions.

## Try the API

\`\`\`bash
curl -s ${BASE}/api/v1/route \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "What is in this screenshot?", "policy": "balanced"}'
\`\`\`
`;
}

function buildDashboard(): string {
  return `# Dashboard

${BASE}/dashboard is the operator workspace for keys, usage, and credits.

## Overview

- Usage summary with period selector (7 or 30 days)
- Tokens, spend, and request counts
- Daily activity by **task family** (not vendor model)
- Top families by spend
- Activity heatmap (streak and contribution grid)

## Workspace navigation

- **API Keys** — create and revoke \`ailerix_\` keys (full key shown once at creation)
- **Families** — family reference shell
- **Observability** — latency and decision-quality breakdowns from analytics
- **Settings** — workspace preferences shell

## Account

- Profile, Activity, Logs, Credits, Preferences
- **Credits** — balance, Stripe packs, ledger history when Stripe is configured
- **Logs** — per-generation route events (family, status, latency, estimated turn cost)

When Clerk auth is enabled, the dashboard requires sign-in. API routes under \`/api/v1/*\` remain usable with bearer keys without visiting the dashboard.

## Related

- Agent auth: ${BASE}/auth.md
- API reference: ${BASE}/docs
`;
}

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { slug } = await context.params;
  const body = MARKDOWN_PAGES[slug];
  if (!body) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
