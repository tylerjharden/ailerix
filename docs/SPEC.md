# Ailerix product specification

Ailerix is an OpenAI-compatible LLM gateway. The product is **not** a model marketplace. The product is a typed routing engine: TypeSafe Jev (System One) classifies every request; Ailerix software walks an Artificial Analysis cost-per-task Pareto chain and banks a provider. The end user never names a model.

This document is the product contract. Implementation sequencing lives in [PLAN.md](./PLAN.md).

## 1. Product thesis

OpenRouter’s Quickstart asks the client to pick a model string (`openai/gpt-5.4`, `openrouter/auto`, `openrouter/free`, or a comma-separated list). `openrouter/auto` still exists because the client is expected to opt into routing. Ailerix inverts that:

1. The only public model slug is `ailerix/auto`.
2. Jev is the only decision-maker for *what kind of task this is*.
3. Ailerix software is the only decision-maker for *which catalog row satisfies that task at the cheapest Artificial Analysis cost-per-task point that still clears the quality floor*.
4. Downstream providers are an implementation detail. Clients do not pass `model`, `models`, `provider`, `plugins`, `presets`, or allowlists.

An aileron banks an aircraft. Ailerix banks a request.

## 2. Non-goals

- A catalog picker, playground model dropdown, or “compare these three slugs” UI.
- Client-specified fallbacks (`models: ["a","b"]`), provider routing, or OpenRouter-style `provider` preferences.
- Scraping Artificial Analysis HTML. Ingest is API + licensed snapshot only.
- Letting Jev emit a model id. Jev answers task questions. Software walks the frontier.
- A second component library, auth product, or billing ledger in the first complete slice.
- Replicating OpenRouter’s full 300+ model marketplace.

## 3. OpenRouter Quickstart teardown

Source: [openrouter.ai/docs/quickstart](https://openrouter.ai/docs/quickstart) plus the adjacent Responses / Completions / Streaming / Structured Outputs / Tool Calling / Vision / Reasoning / Usage Accounting / Provisioning API pages.

### 3.1 What OpenRouter actually is

| Surface | Contract |
| --- | --- |
| Completions | `POST https://openrouter.ai/api/v1/chat/completions` |
| Responses | `POST https://openrouter.ai/api/v1/responses` (OpenAI Responses API shape) |
| Auth | `Authorization: Bearer <OPENROUTER_API_KEY>` |
| Attribution | Optional `HTTP-Referer`, `X-OpenRouter-Title` |
| SDKs | OpenAI SDK with `baseURL` override; `ai` SDK `@openrouter/ai-sdk-provider`; direct `fetch` |
| Model id | Provider-prefixed slug (`openai/gpt-5.4`, `anthropic/claude-sonnet-4.6`) |
| Auto | `openrouter/auto` — classifies ~30 task types, then 7-day spend-share among models that pass a `cost_tier` |
| Free | `openrouter/free` — same classifier, `$0` models only |
| Fallbacks | Comma-separated `model` or `models: []` |
| Variants | `:nitro`, `:floor`, `:exacto` suffixes |
| Provider prefs | `provider: { order, only, ignore, sort, quantizations, data_collection }` |
| Presets | `openrouter/premium`, `@preset/id` |
| App inference | `@app/<slug>` |
| Structured | JSON Schema `response_format` / `text.format` |
| Tools | OpenAI function-calling plus plugins (`web`, `file-parser`) |
| Vision | `image_url` and `input_image` parts |
| Reasoning | `reasoning: { effort }` or `max_tokens`; `include` to echo traces |
| Usage | `usage: { include: true }` — tokens, cost, cached tokens, reasoning tokens |
| Streaming | SSE `data:` frames, OpenAI chunk shape |
| Errors | OpenAI-shaped `{ error: { message, type, code } }` plus `metadata.provider_name` |
| Provisioning | Separate Management API for keys |

### 3.2 What Ailerix keeps

Keep the *wire* that existing OpenAI / Vercel AI SDK clients already speak:

- `POST /api/v1/chat/completions` — messages, `stream`, `tools` / `tool_choice`, `response_format` / JSON Schema, multimodal `image_url` parts, `reasoning`, `usage`, `max_tokens` / `max_completion_tokens`, `temperature`, `stop`.
- SSE streaming in the OpenAI chunk shape.
- `GET /api/v1/models` as a dummy compatibility list (see §6.4). The only advertised id is `ailerix/auto`.
- Error envelope `{ error: { message, type, code } }`.
- Optional attribution headers (`HTTP-Referer`, `X-Ailerix-Title`) for later analytics.

### 3.3 What Ailerix drops

These exist because OpenRouter is a marketplace. They contradict Jev-owned routing:

| OpenRouter field | Why it dies |
| --- | --- |
| `model: "openai/gpt-5.4"` | Client naming a model. 400. |
| `model: "openrouter/auto"` | Client opting into routing. Routing is not optional. |
| `model: "openrouter/free"` | Client pinning a cost tier. Jev + Pareto decide cost. |
| `models: ["a","b"]` and comma-separated slugs | Client fallbacks. Ailerix computes fallbacks from the Pareto chain. |
| `:nitro` `:floor` `:exacto` suffixes | Client latency / price / precision overrides. |
| `provider: { order, only, ignore, sort, … }` | Client provider politics. |
| `@preset/…` `@app/…` | Client-authored routing graphs. |
| Playground / docs “pick a model” examples | Product copy that trains users to name slugs. |
| Public catalog as a shopping list | Catalog is an internal join table, not a SKU list. |

### 3.4 What Ailerix replaces

| OpenRouter | Ailerix |
| --- | --- |
| Client model slug | Always `ailerix/auto`. Any other slug → 400 `model_not_allowed`. |
| ~30-class auto router + 7-day spend share | Jev Choice / Score / Noul over *task families*, then a deterministic Pareto walk. |
| `cost_tier` (low / medium / high / exact) | Jev `quality_floor` + `cost_sensitivity` + `latency_sensitivity`. Software maps those onto the AA frontier. |
| Spend-share popularity | Artificial Analysis cost-per-task USD on the Intelligence Index item. Popularity is not a routing signal. |
| Provider preference object | Capability filter derived from Jev Noul (vision / tools / code / long context / hallucination risk). |
| Open responses that echo the upstream model | Default: `model` field stays `ailerix/auto`. Real upstream id only if `X-Ailerix-Reveal-Route: 1` or an account flag. |

### 3.5 OpenRouter `auto` vs Ailerix (normative contrast)

OpenRouter `auto` (from their docs):

1. Classify the prompt into ~30 task types.
2. Restrict to models in a `cost_tier`.
3. Sample by 7-day spend share.

Ailerix:

1. Jev answers a fixed question set about the *task* (family, floors, sensitivities, hard requirements). Jev never sees catalog ids.
2. Software filters the AA snapshot to models that satisfy capability Nouls and are currently healthy.
3. Software walks the cost-per-task Pareto chain for that family and picks the cheapest point whose Intelligence Index (or family subscore) ≥ `quality_floor`.
4. If Jev confidence is below threshold, software steps one point *up* the frontier (`nextUp`) rather than asking the client.

Spend share, marketplace popularity, and client-named slugs are not inputs.

## 4. Decision ownership

```
client request
    │
    ▼
Ailerix ingest (messages, tools, images, policy hint)
    │
    ▼
Jev / System One          ← task classification ONLY
  Choice: task_family
  Score:  quality_floor, cost_sensitivity, latency_sensitivity
  Noul:   needs_vision, needs_tools, is_code,
          hallucination_sensitive, needs_long_context
    │
    ▼
Ailerix Pareto walker     ← model decision ONLY
  filter by capabilities + health
  walk AA cost-per-task frontier
  pick cheapest point ≥ quality floor
  nextUp on low confidence
    │
    ▼
Provider adapter          ← execution ONLY
  OpenAI / Anthropic / Google / …
    │
    ▼
OpenAI-shaped response
  model: "ailerix/auto"   (unless reveal header)
  ailerix.route: { family, aa_id, cost_per_task, … }
```

### 4.1 Jev may not

- Receive catalog ids, provider names, or `$ / MTok` in question criteria.
- Answer “which model?”
- Be skipped because the client already named a slug.
- Be used as the completion model for the user-visible answer.

### 4.2 Software may not

- Invent a task family Jev did not emit.
- Override `quality_floor` because a model is popular.
- Use `$ / MTok` as the primary cost signal when an AA cost-per-task exists for that family.
- Expose a public “pick your model” path.

### 4.3 The user may

- Send messages, tools, images, structured-output schemas, and stream flags.
- Send an optional **policy hint** (`cheap` \| `balanced` \| `quality` \| `latency`). A hint biases Jev’s *score questions* (it is folded into the Score instructions). It does not select a model and it does not bypass Jev.
- Ask, after the fact, what was routed — only via the reveal header or an account setting.

### 4.4 Policy hints are not model picks

| Hint | What it does to Jev scores | What it does not do |
| --- | --- | --- |
| `cheap` | Raises `cost_sensitivity`, slightly lowers `quality_floor` | Pin DeepSeek / Haiku / Flash |
| `balanced` | Default Score priors | Pin a mid-tier slug |
| `quality` | Raises `quality_floor`, lowers `cost_sensitivity` | Pin Terra / Fable |
| `latency` | Raises `latency_sensitivity` | Pin Flash / Haiku |

The walker still uses AA cost-per-task. A `cheap` hint that Jev scores as frontier-only still lands on the cheapest *eligible* frontier point, not the cheapest model in the catalog.

## 5. Jev question set (normative)

Every routed request calls `POST https://api.typesafe.ai/v1/systemone` with `model: "jev-latest"` when `TYPESAFE_API_KEY` is set. Otherwise the local System One engine answers the same shapes. The question *ids* and *types* are fixed. Criteria copy may be tuned; ids may not.

### 5.1 `task_family` — Choice

Instructions: *Classify the user’s request into exactly one task family. Ignore brand names. Ignore any model the user mentioned; treat a mentioned slug as a capability hint, not a selection.*

| Key | Meaning | AA join |
| --- | --- | --- |
| `intelligence` | Open-ended reasoning, writing, analysis. Default. | Intelligence Index v4.3 (overall) |
| `coding` | Programming, diffs, repo Q&A, stack traces. | Coding / terminal-bench family cost-per-task |
| `agents` | Multi-step tool use, browse, plan-then-act. | Agents / GDPval-style cost-per-task |
| `vision` | Images, screenshots, diagrams are load-bearing. | Multimodal / vision cost-per-task |
| `factual` | Closed-book facts, citations, low hallucination. | Knowledge / SimpleQA-style cost-per-task |
| `long_context` | Documents, books, multi-file corpora. | Long-context cost-per-task (or Index if AA has no split) |
| `professional` | Legal, medical, finance, regulated tone. | Intelligence Index + hallucination Noul gate |

Jev returns `choice`, `probabilities` over the seven keys, and `confidence`.

### 5.2 `quality_floor` — Score

Legend (0 → 3):

0. Trivial rewrite or lookup. Small model is enough.
1. Standard production task. Mid Index is enough.
2. Hard multi-step reasoning. Upper-mid Index.
3. Frontier-only. Top of the Intelligence Index.

The walker treats the Score’s expected value as a continuous floor and maps it onto the AA Index scale (see §7.4).

### 5.3 `cost_sensitivity` — Score

Legend (0 → 3): *indifferent to spend* → *prefer cheaper if quality holds* → *spend is a real constraint* → *minimize USD/task*.

Used only to break near-ties on the frontier (gradient slope threshold). It does not let software drop below `quality_floor`.

### 5.4 `latency_sensitivity` — Score

Legend (0 → 3): *batch-ok* → *interactive* → *tight UX* → *hard real-time*.

When ≥ 2, the walker prefers the eligible point with lower AA output speed / time-to-first-token among points whose cost-per-task is within a slope threshold of the cheapest eligible (see §7.5).

### 5.5 Noul questions

| Id | Instructions | Walker effect |
| --- | --- | --- |
| `needs_vision` | Does the request require image or screenshot understanding? | Drop models without vision if `noul ≥ 0.7`. |
| `needs_tools` | Does the request need tool or function calling? | Drop models without tools if `noul ≥ 0.7`. |
| `is_code` | Is this primarily a programming or repository task? | Soft prior toward `coding` family; drop models without code capability if `noul ≥ 0.75` and family is `coding`. |
| `hallucination_sensitive` | Would a confident falsehood be expensive (legal, medical, citations, money)? | Prefer models with stronger factual / hallucination scores; raise floor by one Index notch if `noul ≥ 0.8`. |
| `needs_long_context` | Does the request depend on a long document or many files? | Drop models below the required context if `noul ≥ 0.7`. |

### 5.6 Forbidden question shapes

The routing engine must not ask Jev:

```ts
// Forbidden — this is the current slice, and it is wrong.
{
  type: "choice",
  instructions: "Select the single best model…",
  criteria: {
    "openai/gpt-5.6-terra": "Frontier reasoning…",
    "deepseek/deepseek-v4": "High code quality per dollar.",
  },
}
```

Catalog ids in Choice criteria make Jev a model picker. That path is deleted in the first implementation phase.

### 5.7 Mentioned slugs

If the user writes “use Claude” or pastes `openai/gpt-5.4`, Jev is instructed to treat it as color, not a command. Software never honors a client `model` field other than `ailerix/auto` or omitted (treated as `ailerix/auto`).

## 6. Public API

Base URL: `https://ailerix.com/api/v1` (production) and `http://127.0.0.1:43147/api/v1` (local).

### 6.1 `POST /chat/completions`

OpenAI Chat Completions subset.

**Required**

- `messages`: OpenAI messages. At least one `user` turn with non-empty content (string or part array).

**Optional**

- `model`: must be omitted or `"ailerix/auto"`. Any other value → `400` `{ error: { type: "invalid_request_error", code: "model_not_allowed" } }`.
- `stream`, `tools`, `tool_choice`, `response_format`, `reasoning`, `usage`, `temperature`, `max_tokens`, `max_completion_tokens`, `stop`.
- `policy`: `cheap` \| `balanced` \| `quality` \| `latency`. Default `balanced`. Unknown values coerce to `balanced` (documented; not silent forever — log a warning).

**Rejected**

- `models`, `provider`, `plugins`, `preset`, `route`, any OpenRouter suffix on `model`.

**Response**

- Standard completion or SSE stream.
- Top-level `model` is `"ailerix/auto"` unless reveal is on.
- Extra field `ailerix` (non-stream) / final SSE annotation:

```ts
type AilerixRouteTrace = {
  family: TaskFamily;
  family_confidence: number;
  quality_floor: number;          // Jev Score 0–3
  aa_index: number;               // selected model's Index
  cost_per_task_usd: number;      // AA item, not a chat-turn estimate
  engine: "jev" | "ailerix-local";
  policy: RoutingPolicy;
  fallback_aa_id: string;
  next_up_used: boolean;
  revealed_model?: string;        // only if reveal header / flag
};
```

### 6.2 `POST /route`

Ailerix-native. No completion. Used by the playground and by clients that want the banked route before they call a provider themselves (rare; most clients should use `/chat/completions`).

Request: `{ prompt? | state?, policy? }`.

Response: `{ object: "ailerix.route", family, model: "ailerix/auto", aa_id, cost_per_task_usd, fallback_aa_id, reasons, decisions, … }`.

`decisions` is the raw System One answer map. It must not contain catalog ids as Choice keys.

### 6.3 `POST /systemone`

Passthrough to TypeSafe Jev (or the local engine). This is a *developer* surface for typed questions, not a way to pick models. Clients may send any Choice / Score / Noul set. Ailerix does not inject the catalog into those questions.

If `model` is present it must be `jev-latest`.

### 6.4 `GET /models`

Compatibility dummy:

```json
{
  "object": "list",
  "data": [
    {
      "id": "ailerix/auto",
      "object": "model",
      "owned_by": "ailerix",
      "description": "Jev-classified task routed along the Artificial Analysis cost-per-task Pareto chain."
    }
  ]
}
```

The internal catalog is **not** listed here. A future authenticated `GET /internal/catalog` may exist for operators. The public `/models` page on the site explains families and policies, not SKUs. The existing 12-row catalog page is an operator/debug view until it is replaced.

### 6.5 Reveal header

`X-Ailerix-Reveal-Route: 1` (or account `reveal_routes: true`):

- `model` in the OpenAI body becomes the upstream slug (for debugging SDK logs).
- `ailerix.revealed_model` is always set.
- Default off. Production apps should stay on `ailerix/auto` so they cannot bake in a slug.

## 7. Artificial Analysis as the arbitrary-task decision

Site: [artificialanalysis.ai](https://artificialanalysis.ai) (not `.com`).

Artificial Analysis publishes an Intelligence Index, family evaluations, latency, and **cost per task** in USD for Index items. They do not publish a “Pareto gradient API.” Ailerix downloads a licensed snapshot and **computes** the frontier and its slope.

### 7.1 Why cost-per-task, not $/MTok

`$ / MTok` is a price list. Cost-per-task is what it costs to finish an Intelligence Index item (or a family item: coding, agents, vision). A cheap-token model that takes 8× the tokens can lose. Ailerix’s arbitrary-task decision is:

> Among models that clear the Jev quality floor and the capability Nouls, pick the minimum AA cost-per-task. If the next point on the frontier buys a large Index gain per extra dollar, and Jev confidence is low or `cost_sensitivity` is low, step up.

That *is* the model decision. Jev does not participate past the scores.

### 7.2 Snapshot schema (Ailerix-owned)

Ingest from AA API v2 (`x-api-key`) and/or a licensed export. Join key: `openrouter_api_id` when present; else a maintained `aa_id → provider_slug` map.

```ts
type AaModelSnapshot = {
  aa_id: string;
  name: string;
  creator: string;
  openrouter_api_id: string | null;
  provider_slug: string;          // our adapter key, e.g. "anthropic/claude-…"
  intelligence_index: number;     // Index v4.3 overall
  family_scores: Partial<Record<TaskFamily, number>>;
  cost_per_task_usd: Partial<Record<TaskFamily, number>> & {
    intelligence: number;         // required — Index item USD
  };
  input_per_mtok_usd: number;
  output_per_mtok_usd: number;
  output_tokens_per_sec: number | null;
  ttft_ms: number | null;
  context_window: number;
  capabilities: {
    vision: boolean;
    tools: boolean;
    code: boolean;
    reasoning: boolean;
  };
  retrieved_at: string;           // ISO
};

type AaFrontierPoint = {
  aa_id: string;
  family: TaskFamily;
  quality: number;                // family score or Index
  cost_per_task_usd: number;
  gradient: number;               // Δquality / Δcost vs previous frontier point
};

type AaSnapshot = {
  version: string;                // AA Index version, e.g. "4.3"
  generated_at: string;
  license: "commercial" | "missing";
  models: AaModelSnapshot[];
  frontiers: Record<TaskFamily, AaFrontierPoint[]>;
};
```

Notes:

- The public Intelligence Index leaderboard is on the order of ~50 models, not 90. Do not invent rows.
- Family `cost_per_task_usd` may be missing. Fallback: use `intelligence` cost-per-task, then (last resort) a synthetic `input*α + output*β` from AA token prices. Mark synthetic points so they lose ties to real AA items.
- `/MTok` stays on the row for billing estimates and the operator catalog. It is not the walker’s primary key.

### 7.3 Building the Pareto chain

For each `TaskFamily`, take eligible models (capability + health + context). Plot `cost_per_task_usd` (x) vs `quality` (y). Keep the **lower-right staircase**: increasing quality, decreasing or equal cost. Formally, a point is on the frontier iff no other eligible point has `quality ≥ q` and `cost < c`, and no other point has `quality > q` and `cost ≤ c`.

Sort frontier points by `cost_per_task_usd` ascending:

```
P0 (cheapest that exists)
P1
…
Pn (highest quality)
```

Gradient at `P[i]` (`i > 0`):

```
gradient[i] = (quality[i] - quality[i-1]) / max(cost[i] - cost[i-1], ε)
```

`gradient[0] = +∞` (the first eligible point is free in slope terms).

AA does not compute this. Ailerix does, on every snapshot refresh.

### 7.4 Mapping Jev `quality_floor` onto the Index

AA Intelligence Index is roughly a 0–100-ish leaderboard scale (treat as continuous; do not hard-code the published max). Ailerix maps Jev’s 0–3 Score onto that scale from the *current snapshot’s* min/max of eligible models:

| Jev Score (expected value) | Floor |
| --- | --- |
| 0.00–0.75 | 15th percentile of snapshot quality |
| 0.75–1.50 | 40th percentile |
| 1.50–2.25 | 65th percentile |
| 2.25–3.00 | 85th percentile |

`hallucination_sensitive ≥ 0.8` bumps the floor one band.

Implementation must derive percentiles from the snapshot, not from a constant “Index 70.”

### 7.5 Walker algorithm (the arbitrary-task decision)

```
eligible = snapshot.models
  .filter(capabilityNouls)
  .filter(healthOk)
  .filter(contextOk)

frontier = pareto(eligible, family)   // sorted cheap → expensive

floor = mapQualityFloor(jev.quality_floor, eligible)

candidates = frontier.filter(p => p.quality >= floor)
if candidates empty:
  candidates = [frontier.last]        // best available, mark degraded

pick = candidates[0]                  // cheapest that clears the floor

if jev.task_family.confidence < 0.55 OR jev.quality_floor.confidence < 0.5:
  pick = nextUp(pick, candidates)     // one step toward higher quality
  next_up_used = true

if jev.cost_sensitivity < 1.0 and next(pick).gradient > SLOPE_WORTH_IT:
  pick = nextUp(pick, candidates)     // quality is cheap at this margin
  next_up_used = true

if jev.latency_sensitivity >= 2:
  window = candidates.filter(p => p.cost <= pick.cost * (1 + LATENCY_BAND))
  pick = min(window, by ttft then tokens/sec)

fallback = nextUp(pick, frontier) ?? echo-local
return { pick, fallback }
```

Constants (tunable, not user-facing):

- `SLOPE_WORTH_IT`: minimum ΔIndex per extra USD to auto-step when the user is not cost-sensitive. Start: median positive gradient on that family’s frontier.
- `LATENCY_BAND`: 0.15 (15% cost headroom to buy speed).
- `ε`: `$0.0001` to avoid divide-by-zero on equal-cost points.

`echo-local` remains the last-ditch deterministic fallback when no provider is healthy.

### 7.6 Refresh and failure

- Refresh the AA snapshot on a cron (target: at least daily; AA Index updates are bursty).
- If the API is down, serve the last good snapshot. Never scrape the site.
- If no snapshot has ever been licensed, ship a **checked-in fixture** captured under a permitted export (or hand-entered public leaderboard figures with `license: "missing"` and a console warning). Routing still works; marketing must not claim live AA.

### 7.7 Licensing (blocking for production claims)

Artificial Analysis Data Platform terms (public site, §2.5 and commercial addendum) restrict using their data to power a competing model-selection product without a **Commercial** license and consent. Ailerix’s walker *is* that product.

- Development: fixture + `license: "missing"`. Do not claim “powered by Artificial Analysis” in the marketing hero.
- Production: Commercial license, API key (`AA_API_KEY`), written consent for model-selection use. Then the hero may say the decision uses AA cost-per-task and Index.
- Do not scrape. Do not republish the full leaderboard as a substitute for their product.

Until the license exists, code paths stay fixture-backed and copy stays “cost-per-task Pareto (Artificial Analysis methodology; fixture data).”

## 8. TypeSafe Jev / System One

- Endpoint: `POST https://api.typesafe.ai/v1/systemone`
- Model: `jev-latest` only
- Auth: `Authorization: Bearer $TYPESAFE_API_KEY`
- Pricing reference (subject to TypeSafe): on the order of `$0.042 / MTok` input; treat as an ops number, not a product promise
- Types: Choice (argmax + probabilities + confidence), Score (expected value over an ordered legend), Noul (P(yes) in `[0,1]` + confidence)
- Local engine: same types, heuristic `analyzePrompt`, used when the key is absent so the playground does not die

Jev is RLCD-trained for structured answers. That is why it owns classification and why a chat model does not.

## 9. Provider execution

Out of scope for the current mocked slice; required for the first *paid* slice.

- Adapters: OpenAI, Anthropic, Google, plus one cheap open-weight endpoint (DeepSeek or Together).
- Keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, etc. Never required to *route*. Completions fail closed with a typed error if the banked provider is missing a key; the walker may then try `fallback`.
- Timeouts and one automatic fallback attempt (the Pareto `nextUp` or the designated fallback).
- Usage accounting: return OpenAI `usage` plus `ailerix.cost_per_task_usd` (AA) and `ailerix.estimated_turn_usd` (token prices × usage). Do not conflate the two.

## 10. Product surfaces

| Surface | Job |
| --- | --- |
| `/` | Thesis: you do not pick a model. Jev classifies. AA cost-per-task banks the request. |
| `/playground` | Prompt + policy hint. Show family, floor, frontier step, reasons. No model `<select>`. |
| `/models` | Explain families, Index, cost-per-task, policies. Operator table of the snapshot is secondary. |
| `/docs` | Completions with `ailerix/auto` only. System One question set. No “pick gpt-5.4” snippet. |
| `POST /api/v1/*` | As in §6. |

Copy rules:

- No lorem. No “Welcome to your app.”
- Do not show OpenRouter-style model shopping.
- Empty / loading / error states on playground and API.

## 11. Security and tenancy

First complete slice: no end-user auth. API is open on the preview host the way the current repo is.

Before any real provider spend:

- Per-request API keys (`ailerix_…`)
- Spend caps
- No key in query strings
- Reveal header does not leak other tenants’ routes
- AA and TypeSafe keys stay server-side

## 12. Acceptance criteria (product-level)

A build meets this spec when all of the following are true:

1. A client cannot force a model. `model: "openai/gpt-5.4"` returns 400. Omitted `model` and `ailerix/auto` succeed.
2. Jev question criteria contain zero catalog ids and zero provider names.
3. The banked model is the cheapest AA cost-per-task point on the family frontier whose quality ≥ the mapped floor, modulo `nextUp` and latency band.
4. `GET /api/v1/models` lists only `ailerix/auto`.
5. Playground has no model dropdown.
6. Completions still speak OpenAI messages, stream, tools, JSON schema, and vision parts.
7. AA ingest is snapshot/API, not scrape. Production claims require Commercial license.
8. Local System One keeps the playground alive without `TYPESAFE_API_KEY`.
9. Exhaustive `switch` on every Jev answer type and every `TaskFamily` / `RoutingPolicy`.

## 13. Current repo vs this spec

The shipped slice still asks Jev to Choice over twelve catalog ids (`routingQuestions` in `src/lib/system-one.ts`) and ranks with `$ / MTok` and a 1–5 quality star (`rankByPolicy`). That is a prototype of *typed routing*, not this product. [PLAN.md](./PLAN.md) deletes that path.

## 14. Glossary

| Term | Meaning |
| --- | --- |
| Jev | TypeSafe System One model (`jev-latest`). Classifies tasks. |
| Task family | One of seven Choice keys. The AA frontier to walk. |
| Cost-per-task | AA USD to complete an Index (or family) item. Not a chat turn. |
| Pareto chain | Increasing quality, non-increasing cost, computed by Ailerix. |
| Gradient | Δquality / ΔUSD between adjacent frontier points. |
| `nextUp` | Step one point toward higher quality on that chain. |
| `ailerix/auto` | The only public model id. |
| Policy hint | Optional bias on Jev Scores. Not a model pick. |
| Reveal | Opt-in echo of the upstream slug. |
