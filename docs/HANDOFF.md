# Ailerix implementation handoff

Work-package briefs for implementer agents. Each brief is self-contained: implement it without re-reading [SPEC.md](./SPEC.md) or [PLAN.md](./PLAN.md) (they are the source of truth if a brief is ambiguous). An orchestrator dispatches packages, runs the gates, and owns git. Implementers do **not** commit, push, or touch files outside their package's file list.

## Global guardrails (every package)

1. **No catalog id or provider name in any Jev `criteria` object.** Jev classifies tasks; software picks models.
2. **No scraping.** Artificial Analysis data enters only through the checked-in fixture (`data/aa-snapshot.json`).
3. **Exhaustive switches.** Every `switch` over a union/enum ends with `default: { const _exhaustive: never = x; throw … }`.
4. **Imports at top of module.** No inline `import()` in function bodies.
5. **Stay in your file list.** If a change seems to require another file, stop and report it instead.
6. Tests use **Vitest** (already installed; `npm test` runs `vitest run`).
7. TypeScript strict; `npx tsc --noEmit` must be clean when you finish.

## Repo facts

- Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui, TypeScript strict, path alias `@/* → src/*`.
- Dev server: `npm run dev` (port 43147). Build: `npm run build`. Tests: `npm test`.
- Existing modules: `src/lib/models.ts` (12-row `CATALOG` — legacy, keep the file), `src/lib/system-one.ts` (Jev types + local engine), `src/lib/router.ts` (routing), API routes under `src/app/api/v1/`.
- Public product rule: the only public model id is `ailerix/auto`. Task families: `intelligence`, `coding`, `agents`, `vision`, `factual`, `long_context`, `professional`.

---

## WP-1 — Jev contract rewrite

**Goal.** Jev must stop choosing models. Replace the catalog-id Choice question with a task-family question set; add the `TaskFamily` type.

**Files.** Create `src/lib/families.ts`. Modify `src/lib/system-one.ts`, `src/lib/router.ts`.

### 1. `src/lib/families.ts`

```ts
export const TASK_FAMILIES = [
  "intelligence",
  "coding",
  "agents",
  "vision",
  "factual",
  "long_context",
  "professional",
] as const;

export type TaskFamily = (typeof TASK_FAMILIES)[number];

export function isTaskFamily(value: string): value is TaskFamily { … }

export const FAMILY_DESCRIPTIONS: Record<TaskFamily, string> = {
  intelligence: "Open-ended reasoning, writing, analysis. The default family.",
  coding: "Programming, diffs, repository Q&A, stack traces.",
  agents: "Multi-step tool use, browsing, plan-then-act workflows.",
  vision: "Images, screenshots, or diagrams are load-bearing.",
  factual: "Closed-book facts, citations, low hallucination tolerance.",
  long_context: "Long documents, books, multi-file corpora.",
  professional: "Legal, medical, finance, or regulated tone.",
};
```

### 2. `routingQuestions` in `src/lib/system-one.ts`

Replace the current implementation (it Choices over `CATALOG` ids — that is the bug). New signature unchanged: `routingQuestions(policy: RoutingPolicy): Record<string, Question>`. Remove the `CATALOG` import from this file entirely.

Question ids and types are **fixed** (the router asserts them):

| id | type | content |
| --- | --- | --- |
| `task_family` | choice | criteria = the 7 families, values from `FAMILY_DESCRIPTIONS`. Instructions: "Classify the user's request into exactly one task family. Ignore brand names. If the user mentions a specific AI model, treat it as a capability hint, not a selection." |
| `quality_floor` | score | legend (0→3): "Trivial rewrite or lookup — a small model is enough." / "Standard production task — a mid-tier model is enough." / "Hard multi-step reasoning — upper-tier quality needed." / "Frontier-only work — top of the leaderboard." |
| `cost_sensitivity` | score | legend (0→3): "Indifferent to spend." / "Prefer cheaper if quality holds." / "Spend is a real constraint." / "Minimize dollars per task." |
| `latency_sensitivity` | score | legend (0→3): "Batch is fine." / "Interactive." / "Tight UX budget." / "Hard real-time." |
| `needs_vision` | noul | "Does this request require image or screenshot understanding?" |
| `needs_tools` | noul | "Does this request need tool or function calling?" |
| `is_code` | noul | "Is this primarily a programming or repository task?" |
| `hallucination_sensitive` | noul | "Would a confident falsehood be expensive here (legal, medical, citations, money)?" |
| `needs_long_context` | noul | "Does this request depend on a long document or many files?" |

Policy hint folds into **Score instructions only** (never into `task_family`), e.g. for `cheap`: append "The caller prefers lower spend; when uncertain between adjacent levels, prefer the lower level." to `quality_floor` and "…prefer the higher level." to `cost_sensitivity`. `quality` inverts that; `latency` biases `latency_sensitivity` up; `balanced` appends nothing. Use an exhaustive switch over `RoutingPolicy`.

### 3. Stub `src/lib/router.ts`

`routeRequest` currently reads `decisions.answers.model` which no longer exists. Keep the exported types compiling and stub the body:

```ts
export async function routeRequest(_input: {
  state: SystemOneState;
  policy: RoutingPolicy;
}): Promise<RouteDecision> {
  // WP-4 wires this to the Artificial Analysis frontier walker.
  throw new Error("routeRequest is being rewired to the frontier walker (WP-4).");
}
```

Delete `rankByPolicy` and `pickFallback` (dead after the stub). Keep `RouteDecision` exported; add optional fields `family?: TaskFamily; aa_id?: string; cost_per_task_usd?: number; next_up_used?: boolean` so API code keeps compiling. The playground/API will surface the thrown error as a 500 until WP-4 — acceptable mid-flight.

### Do not

- Touch `evaluateLocal` / `answerQuestion` heuristics (WP-6 retunes them).
- Touch anything under `src/app/` or `src/lib/aa/`.
- Delete `src/lib/models.ts`.

### Gate

```bash
npx tsc --noEmit
node -e "const s=require('fs').readFileSync('src/lib/system-one.ts','utf8'); const m=s.match(/routingQuestions[\s\S]*$/)[0]; for (const p of ['openai/','anthropic/','google/','deepseek/','qwen/','meta-llama/','mistral/','x-ai/','ailerix/echo']) if (m.includes(p)) { console.error('FORBIDDEN: '+p); process.exit(1); } console.log('clean');"
```

Report: files changed, gate output.

---

## WP-2 — Artificial Analysis snapshot fixture + Pareto builder

**Goal.** A typed, checked-in AA snapshot and a function that computes per-family cost-per-task Pareto frontiers with gradients. Pure data + pure functions; no network, no React.

**Files.** Create `src/lib/aa/types.ts`, `data/aa-snapshot.json`, `src/lib/aa/load.ts`, `src/lib/aa/pareto.ts`, `src/lib/aa/join.ts`, `src/lib/aa/pareto.test.ts`.

### 1. `src/lib/aa/types.ts`

```ts
import type { TaskFamily } from "@/lib/families";

export type AaModelSnapshot = {
  aa_id: string;
  name: string;
  creator: string;
  openrouter_api_id: string | null;
  provider_slug: string;
  intelligence_index: number;
  family_scores: Partial<Record<TaskFamily, number>>;
  cost_per_task_usd: Partial<Record<TaskFamily, number>> & { intelligence: number };
  input_per_mtok_usd: number;
  output_per_mtok_usd: number;
  output_tokens_per_sec: number | null;
  ttft_ms: number | null;
  context_window: number;
  capabilities: { vision: boolean; tools: boolean; code: boolean; reasoning: boolean };
  synthetic?: boolean;
  retrieved_at: string;
};

export type AaFrontierPoint = {
  aa_id: string;
  family: TaskFamily;
  quality: number;
  cost_per_task_usd: number;
  gradient: number; // Δquality / Δcost vs previous frontier point; Infinity for the first
};

export type AaSnapshot = {
  version: string;
  generated_at: string;
  license: "commercial" | "missing";
  models: AaModelSnapshot[];
};
```

(If WP-1 has not landed yet, `@/lib/families` may not exist — in that case define the `TaskFamily` union locally in `types.ts` with the same 7 literals and a `// TODO(WP-1): import from @/lib/families` comment. The orchestrator reconciles.)

### 2. `data/aa-snapshot.json`

Fixture, `license: "missing"`, `version: "4.3-fixture"`. Ten rows with plausible relative figures (this is a fixture; internal consistency beats precision). Use these rows:

| aa_id | provider_slug | index | intelligence $ / task | coding $ / task | vision | tools | code | context | ttft_ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5-6-terra | openai/gpt-5.6-terra | 71 | 4.9 | 5.6 | y | y | y | 1000000 | 2400 |
| claude-fable-5-1 | anthropic/claude-fable-5.1 | 69 | 4.4 | 4.1 | y | y | y | 200000 | 2100 |
| gemini-2-5-pro | google/gemini-2.5-pro | 60 | 2.1 | 2.6 | y | y | y | 1000000 | 1400 |
| grok-4 | x-ai/grok-4 | 58 | 2.8 | 3.0 | n | y | y | 256000 | 1300 |
| deepseek-v4 | deepseek/deepseek-v4 | 54 | 0.7 | 0.8 | n | y | y | 128000 | 1100 |
| qwen3-coder | qwen/qwen3-coder | 48 | 0.65 | 0.6 | n | y | y | 256000 | 900 |
| gpt-5-mini | openai/gpt-5-mini | 45 | 0.35 | 0.55 | n | y | y | 256000 | 600 |
| claude-haiku-4-5 | anthropic/claude-haiku-4.5 | 42 | 0.5 | 0.7 | n | y | y | 200000 | 450 |
| gemini-2-5-flash | google/gemini-2.5-flash | 38 | 0.18 | (omit) | y | y | n | 1000000 | 300 |
| echo-local | ailerix/echo-local | 1 | 0.0 | 0.0 | n | n | n | 32000 | 20 |

Fill remaining fields sensibly (`openrouter_api_id` = provider_slug for real rows, `null` for echo-local; token prices from the legacy catalog in `src/lib/models.ts`; `family_scores.coding` roughly index ±5 where coding cost exists; `retrieved_at` a fixed ISO string). Omit `coding` cost for gemini-2-5-flash (tests the missing-family fallback).

### 3. `src/lib/aa/load.ts`

`loadSnapshot(): AaSnapshot` — read `data/aa-snapshot.json` via `fs.readFileSync` + `path.join(process.cwd(), "data", "aa-snapshot.json")`, parse, validate minimally (models array non-empty, every model has `cost_per_task_usd.intelligence` number), memoize in a module-level variable. `AA_SNAPSHOT_PATH` env var may override the path.

### 4. `src/lib/aa/pareto.ts`

```ts
export function familyQuality(model: AaModelSnapshot, family: TaskFamily): number;
// family_scores[family] ?? intelligence_index

export function familyCost(model: AaModelSnapshot, family: TaskFamily): number;
// cost_per_task_usd[family] ?? cost_per_task_usd.intelligence

export function buildFrontier(models: AaModelSnapshot[], family: TaskFamily): AaFrontierPoint[];
```

`buildFrontier`: sort by cost ascending (tie: quality descending, then `aa_id` for determinism); keep a point iff its quality is strictly greater than every kept point before it (lower-right staircase — dominated points dropped). Gradient: `(q[i]-q[i-1]) / max(c[i]-c[i-1], 1e-4)`; `gradient[0] = Infinity`. Points from `synthetic: true` models lose cost ties to non-synthetic points.

### 5. `src/lib/aa/join.ts`

`providerSlugFor(model: AaModelSnapshot): string` — `openrouter_api_id ?? provider_slug`. Trivial today; the seam for live ingest.

### 6. `src/lib/aa/pareto.test.ts`

- Dominated point (higher cost, lower quality) is dropped.
- Equal cost: higher quality wins, only one survives.
- `familyCost` falls back to `intelligence` when the family cost is missing (use gemini-2-5-flash + `coding`).
- `echo-local` appears as the first (cheapest) frontier point on `intelligence` and never dominates any real model.
- Gradients are positive and finite for `i > 0`; first is `Infinity`.
- `loadSnapshot()` parses the fixture, `license === "missing"`, 10 models.

### Do not

- Fetch anything over the network.
- Import from `src/lib/router.ts`, `src/lib/system-one.ts`, or React code.

### Gate

```bash
npx tsc --noEmit && npm test -- src/lib/aa
```

---

## WP-3 — Frontier walker

**Goal.** The arbitrary-task model decision: given Jev's answers and the snapshot, pick the cheapest frontier point that clears the quality floor, with `nextUp`, latency band, and degraded paths.

**Files.** Create `src/lib/aa/floor.ts`, `src/lib/aa/walk.ts`, `src/lib/aa/walk.test.ts`. Read-only deps: WP-1 types, WP-2 modules.

### 1. `src/lib/aa/floor.ts`

```ts
export function mapQualityFloor(input: {
  qualityFloorScore: number;        // Jev Score expected value, 0–3
  hallucinationNoul: number;        // 0–1
  eligible: AaModelSnapshot[];
  family: TaskFamily;
}): number;
```

Percentile bands over the **eligible models'** `familyQuality` values (interpolated percentile is fine; document the method in a comment): score `[0, 0.75)` → 15th pct; `[0.75, 1.5)` → 40th; `[1.5, 2.25)` → 65th; `[2.25, 3]` → 85th. If `hallucinationNoul >= 0.8`, bump one band (85th stays 85th). Derive from the passed array — never hard-code an Index constant.

### 2. `src/lib/aa/walk.ts`

```ts
export type WalkInput = {
  snapshot: AaSnapshot;
  family: TaskFamily;
  familyConfidence: number;
  scores: { qualityFloor: ScoreAnswer; costSensitivity: ScoreAnswer; latencySensitivity: ScoreAnswer };
  nouls: { vision: number; tools: number; code: number; hallucination: number; longContext: number };
  requiredContext?: number;
};

export type WalkResult = {
  pick: AaModelSnapshot;
  fallback: AaModelSnapshot;
  frontier: AaFrontierPoint[];
  floor: number;
  next_up_used: boolean;
  degraded: boolean;
  reasons: string[];
};

export function walkFrontier(input: WalkInput): WalkResult;
```

Algorithm (constants at top of file: `LATENCY_BAND = 0.15`, `EPSILON = 1e-4`, confidence thresholds `0.55` family / `0.5` floor):

1. **Eligibility filter** over `snapshot.models`: drop non-vision if `nouls.vision >= 0.7`; non-tools if `nouls.tools >= 0.7`; non-code if `nouls.code >= 0.75 && family === "coding"`; `context_window < requiredContext` if `nouls.longContext >= 0.7 && requiredContext` set.
2. If nothing eligible: pick `echo-local` from the snapshot (it passes no filters — special-case: when eligibility empties, fall back to the echo-local row, `degraded: true`, reason `"no_eligible_model"`), fallback = itself.
3. `frontier = buildFrontier(eligible, family)`; `floor = mapQualityFloor(…)` with `qualityFloorScore = scores.qualityFloor.score`.
4. `candidates = frontier.filter(p => p.quality >= floor)`. Empty → `[frontier.at(-1)]`, `degraded: true`, reason `"degraded_best_available"`.
5. `pick = candidates[0]` (cheapest clearing the floor).
6. **nextUp on low confidence**: if `familyConfidence < 0.55 || scores.qualityFloor.confidence < 0.5`, step to the next candidate if one exists; `next_up_used = true`, reason `"next_up_low_confidence"`.
7. **nextUp on steep gradient**: compute `SLOPE_WORTH_IT` = median of positive finite gradients on this frontier. If `scores.costSensitivity.score < 1.0` and the frontier point immediately above `pick` (within `candidates`) has `gradient > SLOPE_WORTH_IT`, step up once. Apply at most **one** nextUp total (step 6 or 7, not both).
8. **Latency band**: if `scores.latencySensitivity.score >= 2`, among `candidates` with `cost_per_task_usd <= pick.cost_per_task_usd * (1 + LATENCY_BAND)`, re-pick the one whose model has lowest `ttft_ms` (null ttft sorts last; tie: higher `output_tokens_per_sec`).
9. `fallback` = the candidate above `pick` (higher quality), else the one below, else echo-local.
10. `reasons`: human strings citing family, floor value, picked `aa_id`, its cost-per-task, and any nextUp/degraded flags. Never phrase as "Jev picked <model>".

Map frontier points back to models via `aa_id`. The function must not read `process.env`.

### 3. `src/lib/aa/walk.test.ts` — table tests against the fixture

Helper to build `ScoreAnswer`s with a given `score`/`confidence` (legend/probabilities can be minimal). All confidences default high (0.9) unless the row says otherwise.

| # | Input | Expect |
| --- | --- | --- |
| 1 | family `intelligence`, floor score 0.2, cost sens 2.5, all nouls low | pick `echo-local` or `gemini-2-5-flash` (cheapest clearing a 15th-pct floor) |
| 2 | family `coding`, `code` noul 0.9, vision 0.1, floor 1.0 | pick has `capabilities.code === true`; not `gemini-2-5-flash` |
| 3 | floor score 2.8 | pick quality ≥ 85th pct (`gpt-5-6-terra` or `claude-fable-5-1`), min cost among those |
| 4 | familyConfidence 0.40, floor 1.0 | `next_up_used === true` |
| 5 | cost sens 0.2, floor 0.5 | `next_up_used === true` (gradient step) |
| 6 | latency sens 2.5, floor 1.0 | pick's ttft ≤ the default pick's ttft; cost within 15% band |
| 7 | vision noul 0.9 | every eligibility survivor has `capabilities.vision`; pick is vision-capable |
| 8 | vision 0.9 AND tools 0.9 AND code 0.9, family coding, floor 2.9 | degraded or vision+tools survivor; `degraded` true iff candidates empty; explicit reason present |

Also assert: `walkFrontier` never returns a synthetic-flagged pick when a non-synthetic candidate ties, and `reasons.length > 0`.

### Do not

- Touch `src/lib/router.ts` or anything under `src/app/`.
- Read `process.env` inside `walk.ts` / `floor.ts`.

### Gate

```bash
npx tsc --noEmit && npm test -- src/lib/aa
```

---

## WP-4 — Endpoint wiring + public API lock

**Goal.** `routeRequest` uses Jev answers + `walkFrontier`; the public API accepts only `ailerix/auto` and never leaks provider slugs by default.

**Files.** Modify `src/lib/router.ts`, `src/app/api/v1/route/route.ts`, `src/app/api/v1/chat/completions/route.ts`, `src/app/api/v1/models/route.ts`. Create `src/app/api/v1/internal/catalog/route.ts`, `src/app/api/v1/chat/completions/route.test.ts` (or `src/lib/router.test.ts` — one integration test file).

### 1. `src/lib/router.ts` — rewrite `routeRequest`

```ts
export type RouteDecision = {
  family: TaskFamily;
  familyConfidence: number;
  aaId: string;
  providerSlug: string;          // internal only — API layers must not emit by default
  costPerTaskUsd: number;
  floor: number;
  fallbackAaId: string;
  nextUpUsed: boolean;
  degraded: boolean;
  policy: RoutingPolicy;
  engine: DecisionEngine;
  latency_ms: number;
  reasons: string[];
  decisions: SystemOneResponse;
};
```

Flow: `evaluateSystemOne({ state, model: "jev-latest", questions: routingQuestions(policy) })` → `assertAnswerType` each of the 9 ids from WP-1 → family = `isTaskFamily(choice) ? choice : "intelligence"` (add reason `"unknown_family"` when coerced) → `requiredContext`: if `needs_long_context` noul ≥ 0.7, `serializeState(state).length` (chars ≈ tokens is fine for the slice) → `walkFrontier(...)` with `loadSnapshot()` → assemble `RouteDecision` (`providerSlug` via `providerSlugFor`). Reasons cite family, floor, cost-per-task — never "Jev picked <slug>".

### 2. `POST /api/v1/route`

Response shape:

```json
{
  "id": "ailr_…", "object": "ailerix.route", "created": 0,
  "model": "ailerix/auto",
  "family": "coding", "family_confidence": 0.82,
  "aa_id": "deepseek-v4", "cost_per_task_usd": 0.8,
  "floor": 47.2, "fallback_aa_id": "gemini-2-5-pro",
  "next_up_used": false, "degraded": false,
  "policy": "balanced", "engine": "ailerix-local", "latency_ms": 88,
  "reasons": ["…"], "decisions": { "…": "…" }, "output": "…"
}
```

Keep the mock `output`, but it describes family + cost-per-task, not a provider slug. Keep `prompt`/`state` + optional `policy` request contract and 400 on empty.

### 3. `POST /api/v1/chat/completions`

- `model` omitted or `"ailerix/auto"` → proceed. Anything else → `400 { "error": { "message": "Ailerix routes every request; model must be omitted or \"ailerix/auto\".", "type": "invalid_request_error", "code": "model_not_allowed" } }`.
- Body containing `models`, `provider`, `plugins`, or `preset` (any value) → `400`, code `"parameter_not_allowed"`, message naming the field.
- Success body: OpenAI shape; top-level `"model": "ailerix/auto"`; mock assistant text cites family and cost-per-task; `ailerix` extension object with `family`, `family_confidence`, `quality_floor` (Jev score), `aa_index`-equivalent `floor`, `cost_per_task_usd`, `engine`, `policy`, `fallback_aa_id`, `next_up_used`. **No `provider_slug`, no catalog slug anywhere in the response.**
- Keep the `policy` field (coerce unknown → `balanced`) and the messages validation.

### 4. `GET /api/v1/models`

Exactly one row:

```json
{ "object": "list", "data": [ { "id": "ailerix/auto", "object": "model", "owned_by": "ailerix",
  "description": "Jev-classified task routed along the Artificial Analysis cost-per-task Pareto chain." } ] }
```

### 5. `GET /api/v1/internal/catalog`

Returns `loadSnapshot()` JSON **only if** `process.env.NODE_ENV !== "production"` or the request has header `x-ailerix-operator` matching `process.env.AILERIX_OPERATOR_KEY` (when set). Otherwise `404 { error: { message: "Not found", type: "invalid_request_error", code: "not_found" } }`.

### 6. Integration tests (call the route handlers directly with `new Request(...)`)

- 400: `model: "openai/gpt-5.4"`, `"openrouter/auto"`, `"openrouter/free"`, `"anthropic/claude-sonnet-4.6:nitro"`; `models: []`; `provider: {}`.
- 200: omitted `model`; `model: "ailerix/auto"`.
- 200 body: `model === "ailerix/auto"`; `JSON.stringify(body)` contains none of `openai/`, `anthropic/`, `google/`, `deepseek/`, `qwen/`, `meta-llama/`, `mistral/`, `x-ai/`.
- `GET /models` → `data.length === 1`, id `ailerix/auto`.
- `/route` 200 → `family` is one of the 7 families; `model === "ailerix/auto"`.

### Do not

- Modify `src/app/api/v1/systemone/route.ts` (the passthrough stays as-is).
- Modify UI components/pages (WP-5b).
- Emit `providerSlug` in any default response body.

### Gate

```bash
npx tsc --noEmit && npm test && npm run build
```

---

## WP-5a — App chrome + dashboard (OpenRouter mockup adaptation)

**Goal.** Ailerix gets the mockups' chrome: header with search and account dropdown (with theme toggle), a `/dashboard` with sidebar + usage summary + activity heatmap (all mock data), and the four-column footer. Attached reference images show the OpenRouter originals; match layout, spacing, and hierarchy — Ailerix branding, copy, and IA.

**Files.** Modify `src/components/site-header.tsx`, `src/components/site-footer.tsx`, `src/app/layout.tsx`. Create `src/components/theme-provider.tsx`, `src/components/account-menu.tsx`, `src/app/dashboard/layout.tsx`, `src/app/dashboard/page.tsx`, `src/components/dashboard/usage-summary.tsx`, `src/components/dashboard/activity-heatmap.tsx`, `src/lib/mock-usage.ts`. Add shadcn primitives under `src/components/ui/` only if missing (`dropdown-menu`, `avatar`, `chart` if you use it). You may run `npm install next-themes recharts` and `npx shadcn@latest add dropdown-menu avatar chart`.

**IA adaptation rules (mandatory).** Ailerix hides model slugs and has no marketplace, so:

- No BYOK, Presets, Guardrails, Classifiers, or provider-Routing sidebar items. Sidebar: WORKSPACE → Overview, API Keys, Families, Observability, Settings; ACCOUNT → Profile, Activity, Logs, Credits, Preferences. Only Overview (`/dashboard`) needs content; others render the shell with a short "coming with API keys" empty state (real copy, no lorem).
- "Top models by spend" becomes **"Top families by spend"** listing task families (`intelligence`, `coding`, …).
- "Daily by model" chart becomes **"Daily by family"** stacked/grouped bars.
- No auth: the dashboard is public with mock data; account menu shows a placeholder identity ("Operator", `operator@ailerix.com`).

**Build.**

1. **Theme**: `next-themes` `ThemeProvider` (attribute `class`, system default, `suppressHydrationWarning` on `<html>`) wired in `src/app/layout.tsx`. Tailwind 4 + shadcn tokens already support `.dark`.
2. **Header** (mockup 1 & 2 top bar): logo/mark (reuse `src/components/mark.tsx`), search input with `⌘K` hint (visual only — focus via keyboard shortcut is a bonus, not required), nav links Home `/`, Playground `/playground`, Families `/models`, Docs `/docs`, Dashboard `/dashboard`; right side avatar button opening a dropdown: identity header, items Profile / Activity / Logs / Credits / Preferences (link to `/dashboard/...` shells or `#`), separator, Sign out (disabled, tooltip "No accounts in this slice"), footer row = light/dark/system segmented toggle like mockup 1. Keep the existing mobile sheet nav working.
3. **Dashboard** (mockup 2): two-column layout — sticky sidebar (sections WORKSPACE / ACCOUNT as above, active state), main column: page head (avatar, "Operator", email), Usage summary card: period select ("Last 7 days"), Tokens / Spend / Requests tabs, big number (e.g. `$0.42`), bar chart of daily values by family (recharts or hand-rolled flex bars — either fine, must theme in dark mode), right rail "Top families by spend" list with family name + amount. Below: Activity card — stats row (Longest streak / Avg per day / Avg per week / Total) + contribution heatmap grid (~52×7 CSS grid of rounded cells, 5 intensity steps, "Less → More" legend). All numbers from `src/lib/mock-usage.ts` (deterministic seeded data — no `Math.random()` at render, avoid hydration mismatch).
4. **Footer** (mockup 3): brand + copyright column, then Product (Playground, Families, Docs, Dashboard), Company (About → `#`, GitHub repo, ailerix.com), Developer (API reference `/docs`, Spec `/docs`, Status → `#`), Connect (GitHub, X → `#`); newsletter row with email input + Subscribe button (non-functional, `aria-label`ed) and one-line disclaimer.
5. Desktop and mobile: sidebar collapses to a horizontal scroll tab row or sheet below `md`; charts and heatmap must not overflow on 375px.

**Do not** touch `src/lib/**` (except the new `mock-usage.ts`), `src/app/api/**`, playground/docs/models page content, or add any model-slug text to the UI.

### Gate

```bash
npx tsc --noEmit && npm run build
grep -RniE "openai/|anthropic/|deepseek/|qwen/|meta-llama/|mistral/|x-ai/" src/app/dashboard src/components/dashboard src/components/site-header.tsx src/components/site-footer.tsx src/components/account-menu.tsx && exit 1 || echo clean
```

Report: files changed, packages added, gate output, any mockup detail you intentionally diverged from.

---

## WP-5b — Content surfaces rewrite

**Goal.** Landing, playground, families page, docs page, and README teach the real product: Jev classifies task families; software walks the AA cost-per-task frontier; you never name a model.

**Files.** Modify `src/app/page.tsx`, `src/components/playground-client.tsx`, `src/app/playground/page.tsx`, `src/app/models/page.tsx`, `src/components/model-catalog.tsx` (or replace with a families component), `src/app/docs/page.tsx`, `README.md`.

**Depends on** WP-4's `/api/v1/route` response shape (documented in WP-4 §2) and WP-5a's chrome.

1. **Landing**: three beats — "Jev classifies the task" / "Software walks the Artificial Analysis cost-per-task frontier" / "You never name a model — the only slug is `ailerix/auto`". Remove any 12-model showcase framing. Keep the visual system.
2. **Playground**: no model select (there is a policy select — keep it, labeled "Policy hint"). Render from the new `/api/v1/route` response: family badge + confidence, quality floor, picked `aa_id` with cost-per-task, `next_up_used` indicator, fallback, reasons list, collapsible raw `decisions`. Keep empty, loading, and error states (a thrown route error renders in the existing error state).
3. **`/models` page**: rename heading to "Families". Primary content: the 7 task families with descriptions (import `FAMILY_DESCRIPTIONS` from `@/lib/families`) and a short explainer of the Pareto walk (floor → cheapest point → nextUp). Secondary, clearly-labeled "Fixture snapshot (operator view)" table rendered from `GET /api/v1/internal/catalog` in dev — guard so production shows only the families explainer.
4. **Docs page**: replace the System One example that Choices over `claude-haiku`/`gpt-5-mini` with the `task_family` question set (7 families + one Score + one Noul). Completions example: `model: "ailerix/auto"` and a note that any other slug returns 400 `model_not_allowed`. Endpoint list updated (add `GET /api/v1/models` note "returns only ailerix/auto").
5. **README**: rewrite the "What this repo is" section — the family/frontier flow is now implemented, not planned; keep links to SPEC/PLAN/site; keep run instructions (port 43147).

**Do not** touch `src/lib/**`, `src/app/api/**`, or the WP-5a chrome/dashboard files.

### Gate

```bash
npx tsc --noEmit && npm run build
grep -RniE "Select the single best model|gpt-5-mini\"|claude-haiku-4.5\"" src/app src/components README.md && exit 1 || echo clean
```

---

## WP-6 — Local Jev heuristics + test consolidation

**Goal.** Without `TYPESAFE_API_KEY`, the local System One engine answers the WP-1 question set sensibly. Full suite green.

**Files.** Modify `src/lib/system-one.ts` (only `analyzePrompt` / `answerQuestion` internals). Create `src/lib/system-one.test.ts`, `src/lib/router.test.ts` (if WP-4 didn't). Modify `package.json` only if the `test` script is missing.

1. **Family Choice**: in `answerQuestion`'s choice branch, when criteria keys are exactly the 7 task families, weight from `PromptSignals`: `isCode` → `coding`; `isVision` → `vision`; `isLong` → `long_context`; tool/agent language (`browse|search the web|multi-step|book |schedule|automate|api call`) → `agents`; citation/fact language (`cite|source|when did|who is|statistic`) → `factual`; regulated language (`legal|medical|contract|compliance|diagnos|tax`) → `professional`; else mass on `intelligence`. Generic keyword-vs-criteria matching stays for non-family Choice questions (the `/systemone` passthrough serves arbitrary callers). **No catalog/model names in any haystack.**
2. **Scores**: `quality_floor` from length/code/long/urgent signals (simple → low, code or long → mid-high, "frontier"/"hardest"/long multi-step → high). `cost_sensitivity` up on `mentionsCost`. `latency_sensitivity` up on `mentionsSpeed`/`isUrgent`. Honor the policy-hint sentences appended to instructions (detect "prefer the lower level" / "prefer the higher level").
3. **Nouls**: extend the instruction matching to cover `hallucination_sensitive` (falsehood/citations/legal/medical/money language) and keep existing vision/tools/code/long/urgent behavior.
4. **Golden-prompt tests** (`system-one.test.ts`, run `evaluateLocal` with `routingQuestions("balanced")`):
   - "refund this double charge before payroll" → family ∈ {`intelligence`, `professional`}, not `coding`.
   - A prompt containing a stack trace + `function` → `coding`; `is_code` noul ≥ 0.7.
   - "what's in this screenshot?" → `needs_vision` ≥ 0.7; family `vision`.
   - An 8000-char string → `needs_long_context` ≥ 0.7.
   - "cite sources: when did the fed last cut rates" → `hallucination_sensitive` ≥ 0.5.
   - All confidences within `[0,1]`; every answer id from WP-1 present with the right type.
   - `JSON.stringify(routingQuestions("cheap"))` contains no provider prefixes (regression guard).
5. **Router integration test** (if missing): `routeRequest` with local engine + fixture returns a `RouteDecision` whose `family` is valid and whose `aaId` exists in the snapshot; a code prompt routes within code-capable models.

### Gate

```bash
npx tsc --noEmit && npm test && npm run build
```

---

## Orchestrator prompt template

Each dispatch sends exactly:

```
Full repository path: /workspace

You are implementing one work package of the Ailerix product. Read /workspace/docs/HANDOFF.md
and implement ONLY the section titled "<WP title>". Obey the Global guardrails section.

Rules:
- Do not commit, push, or run git write commands.
- Do not modify files outside the package's file list; if blocked, stop and report.
- Run the package's Gate commands before finishing.

Report back: (1) files created/modified, (2) gate command output, (3) anything you
could not complete and why.
```

Orchestrator gates between packages: `npx tsc --noEmit`, `npm test`, `npm run build`, plus the package greps. Commit series (one per landed package): see PLAN §6.
