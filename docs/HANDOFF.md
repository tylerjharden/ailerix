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

---

# E-slice: execution + analytics work packages

Context for all WP-E packages: the routing slice (WP-1…WP-6) is done. `routeRequest` in `src/lib/router.ts` runs Jev (`evaluateSystemOne`) and the frontier walker (`walkFrontier` in `src/lib/aa/walk.ts`) over the fixture snapshot (`loadSnapshot` in `src/lib/aa/load.ts`). Completions are still mocked; nothing is persisted. The E-slice makes the banked route actually execute against real provider APIs and records every pipeline decision.

Additional guardrails for E packages:

- Provider API keys come only from `process.env` inside `src/lib/providers/registry.ts` and `src/lib/analytics/db.ts` (`DATABASE_URL`). No other module reads key env vars.
- Absence of every key must never crash anything: routing still works, `echo-local` still executes, analytics falls back to memory.
- Provider slugs still never appear in default response bodies. `aa_id`s are fine.
- Analytics writes are fire-and-forget: a DB outage must not fail or slow a completion.

## WP-E1 — Provider adapters

**Goal.** A typed adapter layer that can execute a chat completion against OpenAI-compatible APIs, Anthropic, and Google, plus a deterministic local echo adapter, keyed off the AA snapshot rows.

**Files.** Create `src/lib/providers/types.ts`, `src/lib/providers/openai-compat.ts`, `src/lib/providers/anthropic.ts`, `src/lib/providers/google.ts`, `src/lib/providers/echo.ts`, `src/lib/providers/registry.ts`, `src/lib/providers/registry.test.ts`. Modify `src/lib/aa/types.ts` (add `provider_model_id: string` to `AaModelSnapshot`) and `data/aa-snapshot.json` (add the field to every row).

### 1. `types.ts`

```ts
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
  ) { super(message); }
}
```

### 2. Adapters

- **`openai-compat.ts`** — factory `openAiCompatAdapter({ baseUrl, apiKeyEnv })`. POST `{baseUrl}/chat/completions`, `Authorization: Bearer`, standard body. Non-stream: map `choices[0]`. Stream: parse SSE lines (`data: …`, skip comments, stop at `[DONE]`), emit `delta` for `delta.content`, `tool_calls` when present, and a final `done` using the last chunk's `finish_reason` and any `usage` (request `stream_options: { include_usage: true }`). Throw `ProviderError("…", "missing_key")` if the env var is unset.
- **`anthropic.ts`** — POST `https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`. Map: system messages → top-level `system` string; user/assistant messages with text (image parts: pass base64/url source through as Anthropic image blocks when trivially mappable, else flatten to text); `max_tokens` required (default 4096). Tools: map OpenAI `function` tools → Anthropic `tools` (name/description/input_schema). Non-stream: join `content[].text`, map `stop_reason` (`end_turn→stop`, `max_tokens→length`, `tool_use→tool_calls`), usage `{input_tokens→prompt_tokens, output_tokens→completion_tokens}`. Stream: SSE events — `content_block_delta` `text_delta` → `delta`; `message_delta` carries `stop_reason` + usage → `done`.
- **`google.ts`** — POST `https://generativelanguage.googleapis.com/v1beta/models/{id}:generateContent` (or `:streamGenerateContent?alt=sse`), header `x-goog-api-key`. Map messages → `contents` (`role: "user" | "model"`, system → `systemInstruction`), text and inline image parts. Non-stream: join `candidates[0].content.parts[].text`, map `finishReason` (`STOP→stop`, `MAX_TOKENS→length`), usage from `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount→reasoning_tokens`). Stream: SSE chunks with the same shape → `delta` events; final chunk's `usageMetadata` → `done`.
- **`echo.ts`** — no network, no key. Deterministic: content = `"[echo-local] "` + last user text (≤600 chars), usage from `Math.ceil(chars/4)`, finish `stop`. Stream: 3 delta chunks + done. Always available.

All network adapters: single `fetch` with the passed `AbortSignal`; non-2xx → `ProviderError(text, "http_error", status)`. No retries inside adapters (the caller owns fallback).

### 3. `registry.ts`

```ts
export type ProviderBinding = {
  adapter: ProviderAdapter;
  apiKeyEnv: string | null;      // null = always available (echo)
};

export function bindingFor(providerSlug: string): ProviderBinding | null;
// prefix match: "openai/" → openai-compat(api.openai.com/v1, OPENAI_API_KEY)
// "deepseek/" → openai-compat(api.deepseek.com, DEEPSEEK_API_KEY)
// "x-ai/" → openai-compat(api.x.ai/v1, XAI_API_KEY)
// "qwen/" → openai-compat(dashscope-intl.aliyuncs.com/compatible-mode/v1, DASHSCOPE_API_KEY)
// "anthropic/" → anthropic(ANTHROPIC_API_KEY)
// "google/" → google(GOOGLE_API_KEY, fallback env GEMINI_API_KEY)
// "ailerix/" → echo(null)

export function isExecutable(providerSlug: string): boolean;
// binding exists AND (apiKeyEnv === null OR process.env[apiKeyEnv] is non-empty)
```

### 4. Fixture `provider_model_id` values

gpt-5-6-terra → `gpt-5.6-terra`; gpt-5-mini → `gpt-5-mini`; claude-fable-5-1 → `claude-fable-5-1`; claude-haiku-4-5 → `claude-haiku-4-5`; gemini-2-5-pro → `gemini-2.5-pro`; gemini-2-5-flash → `gemini-2.5-flash`; grok-4 → `grok-4`; deepseek-v4 → `deepseek-chat`; qwen3-coder → `qwen3-coder-plus`; echo-local → `echo-local`.

### 5. Tests (`registry.test.ts`)

Slug→binding mapping for all prefixes; unknown slug → null; `isExecutable("ailerix/echo-local")` true with no env; `isExecutable("openai/gpt-5.6-terra")` false when env missing (use `vi.stubEnv`); echo adapter completes and streams deterministically; SSE parser handles a synthetic OpenAI-compatible stream (feed a `ReadableStream` of encoded frames through a small parse helper — export the parser for testability).

**Do not** touch `src/lib/router.ts`, any `src/app/**` file, or `src/lib/analytics/**` (concurrent package).

### Gate

```bash
npx tsc --noEmit && npm test -- src/lib/providers src/lib/aa
```

## WP-E3 — Analytics store (Prisma + memory fallback)

**Goal.** A RouteEvent store capturing the full pipeline per request, backed by Prisma/Postgres when `DATABASE_URL` is set, an in-memory ring buffer otherwise. Pure library; endpoint wiring happens in WP-E2/E4/E5.

**Files.** Create `prisma/schema.prisma`, `src/lib/analytics/types.ts`, `src/lib/analytics/db.ts`, `src/lib/analytics/store.ts`, `src/lib/analytics/store.test.ts`. Modify `package.json` scripts only to add `"db:push": "prisma db push"` and `"postinstall": "prisma generate --no-hints"` if needed. `@prisma/client` and `prisma` are already installed by the orchestrator; a real `DATABASE_URL` may exist in `.env` — schema is already pushed by the orchestrator; do NOT run migrations yourself, but you may run `npx prisma generate`.

### 1. `prisma/schema.prisma`

Generator `prisma-client-js`; datasource postgres `env("DATABASE_URL")`. One model:

```prisma
model RouteEvent {
  id               String   @id @default(cuid())
  generationId     String   @unique
  endpoint         String   // "chat.completions" | "route"
  policy           String
  engine           String   // "jev" | "ailerix-local"
  family           String
  familyConfidence Float
  qualityFloor     Float    // Jev score 0-3
  mappedFloor      Float    // AA-scale floor
  aaId             String
  providerSlug     String
  fallbackAaId     String
  nextUpUsed       Boolean
  degraded         Boolean
  executed         Boolean
  revealed         Boolean  @default(false)
  status           String   // "ok" | "provider_error" | "fallback_used" | "mocked" | "route_only"
  errorCode        String?
  jevMs            Int
  walkMs           Int
  providerTtftMs   Int?
  providerTotalMs  Int?
  totalMs          Int
  promptTokens     Int?
  completionTokens Int?
  reasoningTokens  Int?
  costPerTaskUsd   Float
  estimatedTurnUsd Float?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([createdAt])
  @@index([family])
  @@index([status])
}
```

### 2. `types.ts`

`RouteEventInput` mirroring the model minus id/createdAt/updatedAt; `AnalyticsSummary` type: `{ source: "db" | "memory"; totals: { requests, spendUsd, promptTokens, completionTokens }; byDay: Array<{ day: string; requests; spendUsd; tokens; families: Record<string, number> }>; byFamily: Array<{ family; requests; spendUsd; avgTotalMs }>; rates: { nextUp; degraded; providerError; executed }; latency: { jevMsP50; walkMsP50; providerTotalMsP50; totalMsP50; totalMsP95 } }`.

### 3. `db.ts`

Prisma client singleton with the global-caching pattern; export `dbAvailable(): boolean` (true iff `process.env.DATABASE_URL` is non-empty). Import `PrismaClient` at module top (guardrail: no inline imports); instantiate lazily inside the getter so a missing DATABASE_URL never throws at import time.

### 4. `store.ts`

- `recordEvent(input: RouteEventInput): Promise<void>` — always append to a module-level ring buffer (cap 500); if `dbAvailable()`, also `prisma.routeEvent.create` inside try/catch (swallow + `console.warn` on failure). Never throws.
- `getEvent(generationId)` — DB first, memory fallback.
- `listEvents({ limit = 50 })` — newest first, DB first, memory fallback.
- `summarize({ days = 7 })` — compute `AnalyticsSummary` from DB rows (single `findMany` over the window is fine at this scale — no raw SQL needed) or from the ring buffer; `source` reflects which. Percentiles computed in JS.

### 5. Tests (`store.test.ts`)

Run WITHOUT `DATABASE_URL` (memory path): recordEvent + getEvent roundtrip; ring buffer caps at 500; summarize computes totals/rates/percentiles on a seeded set; `summarize` with zero events returns zeroed shape with `source: "memory"`. Do not test the Postgres path (no DB in CI).

**Do not** touch `src/lib/providers/**` (concurrent package), `src/lib/router.ts`, or `src/app/**`.

### Gate

```bash
npx prisma validate && npx tsc --noEmit && npm test -- src/lib/analytics
```

## WP-E2 — Execution wiring

**Goal.** `/chat/completions` executes the banked route against the real provider (streaming included), with key-aware eligibility, one fallback attempt, reveal header, real usage, and RouteEvent persistence. `/route` records events too.

**Files.** Modify `src/lib/router.ts`, `src/app/api/v1/chat/completions/route.ts`, `src/app/api/v1/route/route.ts`. Create `src/lib/execute.ts`, `src/lib/execute.test.ts`. Read-only deps: WP-E1 providers, WP-E3 store.

### 1. `src/lib/router.ts`

- Filter `loadSnapshot().models` through `isExecutable(model.provider_slug)` before `walkFrontier`. If the filter leaves nothing (impossible while echo-local exists, but guard), use the unfiltered snapshot and set a `no_executable_provider` reason.
- Capture timings: `jevMs` (around `evaluateSystemOne`), `walkMs` (around `walkFrontier`). Add both to `RouteDecision` plus `providerModelId` and `fallbackProviderSlug`/`fallbackProviderModelId` (resolved from the snapshot).

### 2. `src/lib/execute.ts`

`executeRoute({ decision, messages, stream, params, revealed }): Promise<ExecutionResult>`:

- Resolve binding via `bindingFor(decision.providerSlug)`; build `AdapterRequest` forwarding `temperature`, `top_p`, `max_tokens`/`max_completion_tokens`, `stop`, `tools`, `tool_choice`, `response_format`, `reasoning.effort`. Track `dropped_params: string[]` for accepted-but-unforwardable fields (e.g. `logit_bias`, `seed`).
- Timeout: `AbortSignal.timeout(60_000)` per attempt.
- Attempt the pick; on `ProviderError` (or abort), attempt the fallback binding once (`fallback_used`). Both fail → throw a typed error carrying `error_type: "provider_unavailable"` (502).
- Capture `providerTtftMs` (first delta) and `providerTotalMs`.
- Non-stream result: `{ kind: "json", content, tool_calls?, finish_reason, usage, executedSlug, executedAaId, fallbackUsed, ttftMs, totalMs, droppedParams }`. Stream result: `{ kind: "stream", events: AsyncGenerator<AdapterEvent>, meta… }` where meta resolves usage/finish at the end (expose an `onDone` promise the route handler awaits inside `after()` for persistence).
- `estimatedTurnUsd`: `(prompt_tokens * input_per_mtok_usd + completion_tokens * output_per_mtok_usd) / 1_000_000` from the executed model's snapshot row; null when usage missing.

### 3. `/chat/completions` route

- Reveal: `request.headers.get("x-ailerix-reveal-route") === "1"` → response `model` = executed provider slug and `ailerix.revealed_model` set; default stays `ailerix/auto`.
- Execute via `executeRoute`. Non-stream: real `content`, `tool_calls`, `finish_reason`, provider `usage` (fallback to char estimate only when adapter returned null), `ailerix` trace gains `executed: true|false`, `estimated_turn_usd`, `fallback_used`, `dropped_params`. Stream: convert `AdapterEvent`s to OpenAI chunks (role chunk first, deltas, tool_calls chunk, final chunk with finish_reason + usage + `ailerix` trace, then `[DONE]`).
- If `executeRoute` throws provider_unavailable: 502 with the typed envelope `{ error: { message, type: "api_error", code: "provider_unavailable", metadata: { error_type: "provider_unavailable" } } }`.
- Generation id: `gen_${crypto.randomUUID()}` used as the completion `id` and returned as header `X-Ailerix-Generation-Id` on every response (including streams).
- Persistence: build a full `RouteEventInput` and call `recordEvent` inside `next/server`'s `after()` (import at top). Stream path: persist after `onDone` resolves. Statuses: `ok`, `fallback_used`, `provider_error` (502 path — still record), `mocked` (echo-only path is still `ok` + `executed: true`; `mocked` is reserved for adapter-bypass, which should now be unreachable).
- Keep every existing 400 behavior and the existing tests passing (`usage` shape unchanged, body still slug-free by default — echo/aa ids fine).

### 4. `/route` route

Record a RouteEvent (`endpoint: "route"`, `status: "route_only"`, `executed: false`, provider fields from the decision, usage null) via `after()`. Response gains `generation_id` and the same header.

### 5. Tests (`execute.test.ts`)

Using the echo binding (no env needed): non-stream execute returns echo content + usage; stream execute yields deltas then done; fallback: a fake binding that throws `ProviderError` as pick with echo as fallback → `fallbackUsed: true`; both-fail → typed provider_unavailable error; `estimatedTurnUsd` computed from snapshot prices. Update `route.test.ts` expectations only if a field was added (do not weaken slug-leak assertions).

**Do not** touch dashboard/UI files or `src/app/api/v1/models/**`, `internal/**`, `systemone/**`.

### Gate

```bash
npx tsc --noEmit && npm test && npm run build
```

Live check (orchestrator runs too): with no provider keys, `POST /chat/completions` returns echo-local content with `executed: true` and an `X-Ailerix-Generation-Id` header; with `OPENAI_API_KEY` etc. set, returns real model output.

## WP-E4 — Real dashboard analytics

**Goal.** The dashboard reads real pipeline data: Overview from the summary API, Logs as a route-event table, Observability as latency/decision breakdowns. Mock data remains only as a labeled sample fallback.

**Files.** Create `src/app/api/v1/analytics/summary/route.ts`, `src/app/api/v1/analytics/events/route.ts`, `src/components/dashboard/logs-table.tsx`, `src/components/dashboard/observability.tsx`. Modify `src/app/dashboard/page.tsx`, `src/components/dashboard/usage-summary.tsx`, `src/lib/mock-usage.ts` (only to export a clearly named `sampleUsage` used as fallback).

1. **APIs**: both operator-gated exactly like `src/app/api/v1/internal/catalog/route.ts` (non-production OR `x-ailerix-operator` matching `AILERIX_OPERATOR_KEY`) — the dashboard fetches them same-origin in dev/preview. `summary` → `summarize({ days })` (`?days=7|30`); `events` → `listEvents({ limit ≤ 200 })`.
2. **Overview**: fetch summary client-side; when `totals.requests > 0`, charts/cards/top-families render real data (spend by day/family, requests, tokens); when zero or fetch fails, render the existing seeded sample with a visible `Badge` "Sample data — no traffic recorded yet". Keep the Tokens/Spend/Requests tabs and the heatmap (heatmap may stay sample-backed with the badge until enough history exists; label it).
3. **Logs tab**: real table — time, generation id (truncated, monospace), endpoint, family badge, aa_id, policy, status badge (ok green / fallback amber / error red / route_only muted), cost-per-task, est. turn USD, total ms. Empty state: "No requests yet — hit the playground." Loading skeleton + error alert.
4. **Observability tab**: latency breakdown card (Jev / walk / provider p50 bars from `summary.latency`), decision quality card (nextUp %, degraded %, executed %, provider-error %), family distribution bar. Same loading/empty states.
5. No provider slugs in the UI (aa_ids fine). Desktop + 375px must not overflow.

**Do not** touch `src/lib/**` besides `mock-usage.ts`, or API routes other than the two new analytics routes.

### Gate

```bash
npx tsc --noEmit && npm run build
grep -RniE "openai/|anthropic/|deepseek/|qwen/|meta-llama/|mistral/|x-ai/" src/app/dashboard src/components/dashboard && exit 1 || echo clean
```

## WP-E5 — Generation lookup + error taxonomy

**Goal.** OpenRouter-parity `GET /api/v1/generation?id=` and a stable typed error taxonomy across all endpoints.

**Files.** Create `src/lib/api-error.ts`, `src/app/api/v1/generation/route.ts`, `src/app/api/v1/generation/route.test.ts`. Modify `src/app/api/v1/chat/completions/route.ts`, `src/app/api/v1/route/route.ts`, `src/app/api/v1/models/route.ts` (only if it can error), `src/app/api/v1/internal/catalog/route.ts`, `src/app/api/v1/systemone/route.ts` — error paths only.

1. **`api-error.ts`**: `export const ERROR_TYPES = ["invalid_request","model_not_allowed","parameter_not_allowed","not_found","provider_unavailable","timeout","server"] as const;` + `apiError({ status, message, code, errorType })` returning the envelope `{ error: { message, type, code, metadata: { error_type } } }` (`type`: `invalid_request_error` for 4xx, `api_error` for 5xx). Exhaustive switch where errorType branches exist.
2. **Generation endpoint**: `GET /api/v1/generation?id=gen_…` → `getEvent(generationId)` from `@/lib/analytics/store`. Found → `{ data: { id, created_at, endpoint, policy, engine, family, family_confidence, quality_floor, mapped_floor, aa_id, fallback_aa_id, next_up_used, degraded, executed, status, latency: { jev_ms, walk_ms, provider_ttft_ms, provider_total_ms, total_ms }, usage: { prompt_tokens, completion_tokens, reasoning_tokens }, cost: { cost_per_task_usd, estimated_turn_usd } } }`. **Omit `providerSlug`** from the public shape. Missing id param → 400 `invalid_request`; unknown id → 404 `not_found`. Public (no operator gate) — parity with OpenRouter, and it leaks no slugs.
3. **Refactor existing error paths** to `apiError` (keep messages and codes identical where tests assert them — `model_not_allowed` and `parameter_not_allowed` messages must not change; they now additionally carry `metadata.error_type`).
4. Tests: generation 400/404/200 (record a memory event via `recordEvent` first); envelope shape includes `metadata.error_type`; completions 400s still match previous assertions.

**Do not** touch UI files or `src/lib/providers/**`.

### Gate

```bash
npx tsc --noEmit && npm test && npm run build
```

---

# G-slice: auth, credits, agent-readiness, MCP work packages

Context for all G packages: routing + execution + analytics are live (Neon Postgres via Prisma; `DATABASE_URL` set). Dependencies preinstalled: `@clerk/nextjs` (v7), `@clerk/mcp-tools`, `mcp-handler`, `@modelcontextprotocol/sdk`, `stripe`, `zod`.

Cross-cutting G guardrails:

- **Auth is optional at runtime.** Central helper `src/lib/auth-config.ts` (created in G1) exports `authEnabled()`. When Clerk keys are absent in production builds, the app renders and routes anonymously — never crash at build or request time for missing `CLERK_*`, `STRIPE_*`, or ACP env. This also powers the Hugging Face demo mode.
- **Money integrity**: all credit mutations go through `grantCredits` / `debitCredits` in `src/lib/credits.ts` (G2). No endpoint writes `CreditLedger` directly.
- **Public API discovery routes** (`/.well-known/*`, `/openapi.json`, `/auth.md`, `/llms.txt`, `robots.txt`, `sitemap.xml`) are always public — G1's middleware must never protect them.
- Provider slugs still never leak on default paths; `aa_id`s fine.

## G1 — Clerk auth + anonymous vs signed-in shell

**Files.** Create `src/middleware.ts`, `src/lib/auth-config.ts`, `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`. Modify `src/app/layout.tsx`, `src/components/account-menu.tsx`, `src/app/dashboard/layout.tsx`.

1. `src/lib/auth-config.ts`:

```ts
export function authEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_SECRET_KEY ||
      process.env.NODE_ENV === "development", // Clerk Keyless works in dev
  );
}
```

2. `src/middleware.ts`: when `authEnabled()`, run `clerkMiddleware` with `createRouteMatcher` protecting only `/dashboard(.*)` (redirect to sign-in). Everything else — `/`, `/playground`, `/docs`, `/models`, `/api/(.*)`, `/.well-known/(.*)`, `/sign-in`, `/sign-up`, static — stays public. When auth is disabled, export a pass-through middleware. Matcher config must exclude `_next`, static assets. IMPORTANT: structure the middleware so G4 can add a markdown-content-negotiation rewrite step in the same file (a small exported `negotiateMarkdown(request)` placeholder returning `null` is fine).
3. `src/app/layout.tsx`: wrap in `<ClerkProvider dynamic>` only when `authEnabled()`; keep ThemeProvider nesting.
4. `src/components/account-menu.tsx`: `<SignedIn>` → real user (`useUser` name/email/avatar) + Sign out via `useClerk().signOut()`; `<SignedOut>` → "Sign in" button linking `/sign-in`. When auth is disabled entirely, keep today's static Operator menu. Keep the theme toggle rows.
5. Sign-in/up pages: Clerk `<SignIn />` / `<SignUp />` components centered in the site chrome (shadcn Card frame), `appearance` matched to theme.
6. Dashboard layout: when `authEnabled()` and signed out, middleware already redirects; page header shows the real identity instead of "Operator" when signed in (client `useUser`).

Do not touch `src/app/api/**`, `prisma/**`, or `src/lib/**` other than the new auth-config.

Gate: `npx tsc --noEmit && npm test && npm run build` (build without Clerk keys must succeed), plus dev-server check: `/` 200, `/dashboard` redirects (or renders if keyless dev session machinery allows), `/sign-in` renders.

## G2 — Accounts schema, API keys, credit metering

**Files.** Modify `prisma/schema.prisma`, `src/app/api/v1/chat/completions/route.ts`, `src/app/api/v1/route/route.ts`, `src/lib/execute.ts` (only if needed for debit hook), `src/components/dashboard/*` (API Keys tab), `src/app/dashboard/page.tsx` (wire tab). Create `src/lib/credits.ts`, `src/lib/api-keys.ts`, `src/lib/request-identity.ts`, `src/app/api/v1/key/route.ts`, `src/app/api/keys/route.ts` (session-authed CRUD), `src/lib/credits.test.ts`. Orchestrator runs `prisma db push` after review — do NOT run it yourself; run `npx prisma validate` + `npx prisma generate`.

1. Schema additions (workspace Prisma conventions):

```prisma
model Account {
  id        String   @id @default(cuid())
  clerkId   String   @unique
  email     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  apiKeys   ApiKey[]
  ledger    CreditLedger[]
}

model ApiKey {
  id         String    @id @default(cuid())
  accountId  String
  account    Account   @relation(fields: [accountId], references: [id])
  name       String
  keyHash    String    @unique // sha256 of full key
  prefix     String    // "ailerix_" + first 8 chars, for display
  disabled   Boolean   @default(false)
  lastUsedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  @@index([accountId])
}

model CreditLedger {
  id           String   @id @default(cuid())
  accountId    String
  account      Account  @relation(fields: [accountId], references: [id])
  deltaUsd     Float    // + grant, - debit
  balanceAfter Float
  reason       String   // "stripe_checkout" | "acp_order" | "usage_debit" | "signup_grant" | "adjustment"
  ref          String?  // stripe session id / acp checkout id / generationId
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([accountId, createdAt])
}

model AnonymousUsage {
  id        String   @id @default(cuid())
  anonId    String   // sha256(ip + UTC day)
  day       String   // YYYY-MM-DD
  count     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([anonId, day])
}
```

Plus nullable `accountId`, `apiKeyId`, `anonId` columns + `@@index([accountId])` on `RouteEvent`.

2. `src/lib/credits.ts`: `grantCredits({accountId, usd, reason, ref})`, `debitCredits({accountId, usd, reason, ref})` (transactional: append ledger row with computed `balanceAfter`), `getBalance(accountId)`, `ensureAccount(clerkId, email?)`. `SIGNUP_GRANT_USD = 1.00` granted on first `ensureAccount`. All no-ops returning null when `!dbAvailable()`.
3. `src/lib/api-keys.ts`: `createKey(accountId, name)` → returns full key once (`ailerix_` + 32 hex), stores hash; `verifyKey(bearer)` → account or null; `revokeKey`, `listKeys`. Node `crypto`, no new deps.
4. `src/lib/request-identity.ts`: resolve, in order — `Authorization: Bearer ailerix_…` → account; Clerk session (`auth()` from `@clerk/nextjs/server`, guarded by `authEnabled()`) → account via `ensureAccount`; else anonymous (`anonId` = sha256 of `x-forwarded-for` first hop + UTC day). Returns `{ kind: "key"|"session"|"anon", accountId?, apiKeyId?, anonId? }`.
5. Metering in `/chat/completions` + `/route`: anonymous → increment `AnonymousUsage` (upsert), cap **25/day**: over → 429 envelope `error_type: "rate_limit_exceeded"`. Account → after execution compute `debit = (estimated_turn_usd ?? 0) * 1.10`; if `getBalance() <= 0` and debit would apply → 402 `{ code: "insufficient_credits", metadata.error_type: "payment_required" }` BEFORE execution (echo-only requests with $0 estimate still pass). Record identity fields on the RouteEvent. API 401 (bad key) responses must include header `WWW-Authenticate: Bearer resource_metadata="https://ailerix.com/.well-known/oauth-protected-resource"`.
6. `GET /api/v1/key` (OpenRouter parity): bearer key required → `{ data: { label, usage_usd, balance_usd, is_free_tier: balance<=SIGNUP_GRANT, anonymous_daily: null } }`.
7. `/api/keys` (session-authed JSON CRUD for the dashboard) + dashboard API Keys tab: list/create (show full key once in a dialog)/revoke. Keep 375px sane.
8. Tests (memory/db-less paths): key create/verify/revoke roundtrip (mock prisma via dbAvailable false → these functions need a memory fallback for tests: use a module-level Map when `!dbAvailable()`), anon cap logic, debit math, 402 shape.

Gate: `npx prisma validate && npx tsc --noEmit && npm test && npm run build`.

## G3 — Stripe credits (human flow)

**Files.** Create `src/lib/stripe.ts`, `src/app/api/stripe/checkout/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/components/dashboard/credits-panel.tsx`. Modify `src/app/dashboard/page.tsx` (Credits tab), `.env.example`.

1. `src/lib/stripe.ts`: lazy Stripe client; `stripeEnabled()` = `!!process.env.STRIPE_SECRET_KEY`. Credit packs constant: `[{id:"CREDITS-5", usd:5},{id:"CREDITS-20", usd:20},{id:"CREDITS-100", usd:100}]` — single source, exported (G5 ACP reuses it).
2. `POST /api/stripe/checkout` (session-authed): body `{ pack }` → Checkout Session, `mode: "payment"`, inline `price_data` (no pre-created products), `metadata: { accountId, pack }`, success/cancel URLs → `/dashboard?tab=credits&status=…`. 503 `stripe_not_configured` when disabled.
3. `POST /api/stripe/webhook`: raw-body `constructEvent` with `STRIPE_WEBHOOK_SECRET`; on `checkout.session.completed` → `grantCredits({reason:"stripe_checkout", ref: session.id})`, idempotent on `ref` (skip if a ledger row with that ref exists).
4. Credits panel: balance (big number), three pack buttons (disabled with tooltip when Stripe unconfigured), ledger table (reason, delta, balance, time), empty/loading states.
5. `.env.example`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, Clerk keys documented.

Gate: `npx tsc --noEmit && npm test && npm run build`; grep: no `sk_live`/`sk_test` literals.

## G4 — Agent-readiness surface

**Files.** Create `src/app/robots.ts`, `src/app/sitemap.ts`, `public/llms.txt`, `public/auth.md`, `public/openapi.json`, `public/.well-known/api-catalog`, `public/.well-known/mcp/server-card.json`, `public/.well-known/agent-card.json`, `public/.well-known/agent-skills/index.json`, `public/.well-known/ai-catalog.json`, `src/app/md/[slug]/route.ts`. Modify `next.config.ts` (Link + content-type headers), `src/middleware.ts` (markdown negotiation step only).

1. `robots.ts`: allow all; explicit `User-agent` allows for GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, OAI-SearchBot; sitemap URL. Append raw lines `Content-Signal: ai-train=yes, search=yes, ai-input=yes` — Next's robots API can't emit custom directives, so use a `public/robots.txt`-style static ROUTE (`src/app/robots.txt/route.ts` returning text) instead of `robots.ts` if needed for the Content-Signal line. Sitemap via `src/app/sitemap.ts` (all public pages).
2. Markdown negotiation: in middleware, if `Accept` includes `text/markdown` and pathname ∈ {`/`, `/docs`, `/models`, `/playground`, `/dashboard`}, rewrite to `/md/{slug}`; `src/app/md/[slug]/route.ts` returns hand-authored Markdown summaries (`Content-Type: text/markdown; charset=utf-8`) — real content, not lorem: product thesis, API usage with `ailerix/auto`, families, links. `/llms.txt`: index of those markdown URLs + docs links.
3. `public/openapi.json`: OpenAPI 3.1 for `/api/v1/chat/completions`, `/route`, `/systemone`, `/models`, `/generation`, `/analytics/summary`, `/key` — accurate schemas incl. the `model_not_allowed` 400 and 402. Keep it hand-written and truthful.
4. `next.config.ts` headers: on `/` add `Link: </.well-known/api-catalog>; rel="api-catalog", </openapi.json>; rel="service-desc"`; correct `Content-Type` for `/.well-known/api-catalog` (`application/linkset+json`).
5. Well-known JSON (all static, all referencing https://ailerix.com):
   - `api-catalog`: RFC 9727 linkset — anchor `https://ailerix.com/api/v1`, `service-desc` → `/openapi.json`, `service-doc` → `/docs`.
   - `mcp/server-card.json`: `$schema` `https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json`, `protocolVersion: "2026-07-28"`, serverInfo `ailerix`, transport `{type:"streamable-http", endpoint:"https://ailerix.com/api/mcp"}`, `authentication: {type:"oauth2", resource_metadata:"https://ailerix.com/.well-known/oauth-protected-resource"}`, tools: `route_preview`, `create_completion`, `get_generation`, `analytics_summary`, `credit_balance`, `buy_credits` (concise input schemas — must match G6).
   - `agent-card.json` (A2A): name/description/version, service URL `https://ailerix.com/api/mcp`, capabilities, skills (route/complete/top-up).
   - `agent-skills/index.json`: three skills (route-a-completion, check-credits, top-up-credits) with `url` pointing at `/auth.md` + docs anchors.
   - `ai-catalog.json` (ARD): `specVersion`, host block, entries referencing the server card, agent card, skills index, acp.json by URL with proper media types.
6. `public/auth.md`: plain-language agent onboarding — anonymous tier (25/day), API keys via dashboard, OAuth for MCP (Clerk), 402 semantics, credit packs, ACP checkout pointer.
7. Do NOT create `/.well-known/oauth-protected-resource` (G6 owns it, dynamic).

Gate: `npx tsc --noEmit && npm run build`; `curl -H "Accept: text/markdown" /` returns markdown; every listed static file parses (`jq`) and every URL inside them is absolute https://ailerix.com.

## G5 — ACP agentic commerce

**Files.** Create `src/lib/acp.ts`, `src/app/api/acp/checkout_sessions/route.ts`, `src/app/api/acp/checkout_sessions/[id]/route.ts`, `.../[id]/complete/route.ts`, `.../[id]/cancel/route.ts`, `public/.well-known/acp.json`, `public/acp-feed.jsonl`, `src/app/api/acp/acp.test.ts`. Reuses `CREDIT_PACKS` from `src/lib/stripe.ts`, `grantCredits` from `src/lib/credits.ts`.

1. `acp.json`: `{"protocol":{"name":"acp","version":"2026-04-17"},"api_base_url":"https://ailerix.com/api/acp","transports":["http"],"capabilities":{"services":["checkout"]}}` (exact types — services is an array of strings).
2. `acp-feed.jsonl`: one line per pack — `item_id` (`CREDITS-5` etc.), `title`, `description`, `url` (`https://ailerix.com/dashboard?tab=credits`), `brand: "Ailerix"`, `seller_name`, `image_url` (logo), `availability: "in_stock"`, `price: "5.00 USD"`, `is_digital: true`, `is_eligible_checkout: true`, `seller_tos`/`seller_privacy_policy` URLs.
3. Session store: new Prisma model NOT required — persist as `AcpCheckoutSession` rows? Keep it simple: a Prisma model `AcpSession { id, status, itemsJson, buyerJson, totalMinor, currency, orderId?, createdAt, updatedAt }` added to the schema (orchestrator pushes). Memory fallback map when `!dbAvailable()`.
4. Endpoints per spec: create (201, `status: "ready_for_payment"` immediately — digital, no address needed; `payment_provider: {provider:"stripe", supported_payment_methods:["card"]}`; line_items with integer minor units; `fulfillment_options: [{type:"digital", id:"digital", title:"Instant credit grant", subtotal:"0", tax:"0", total:"0"}]`; `totals[]`; `links[]` to ToS/privacy), update, get (404 unknown), cancel (405 if completed), complete: verify session, extract SPT from `payment_data.token` (support both flat and 2026-01-30 handler shape), if `stripeEnabled()` → `stripe.paymentIntents.create({amount, currency, confirm: true, shared_payment_granted_token: token}, {apiVersion header via stripeVersion option "2026-04-22.preview"})`; grant credits keyed by `buyer.email` (ensure account by email — `ensureAccountByEmail` helper added to credits.ts), `status:"completed"` + `order {id, checkout_session_id, permalink_url: https://ailerix.com/orders/{id}}`. Stripe disabled → `messages:[{type:"error", code:"payment_declined", …}]`.
5. Headers: echo `Idempotency-Key` + `Request-Id`; idempotent create on `Idempotency-Key` (reuse stored response); ignore `Signature` verification when `ACP_SIGNING_KEY` unset (verify HMAC when set).
6. Order webhook emission: if `ACP_ORDER_WEBHOOK_URL` set, POST `order_created` then `order_updated` (`fulfilled`) with HMAC header when `ACP_WEBHOOK_SECRET` set; fire-and-forget.
7. Tests: create→get→update→complete lifecycle in memory mode (Stripe disabled path asserts declined message; a fake stripe client via dependency injection asserts SPT param passed), cancel-after-complete 405, idempotent create.

Gate: `npx prisma validate && npx tsc --noEmit && npm test && npm run build`.

## G6 — OAuth MCP server (Clerk as AS)

**Files.** Create `src/app/api/mcp/[transport]/route.ts` (mcp-handler convention), `src/app/.well-known/oauth-protected-resource/route.ts`, `src/lib/mcp-tools.ts`, `src/lib/mcp.test.ts`. Modify `.env.example` only.

1. Use `createMcpHandler` from `mcp-handler`. Tools (zod schemas), thin wrappers over existing libs (import, don't re-implement):
   - `route_preview({ prompt, policy? })` → routeRequest result (family, aa_id, cost_per_task, reasons)
   - `create_completion({ prompt, policy? })` → executes via the same path as /chat/completions (non-stream), returns content + ailerix trace
   - `get_generation({ generation_id })` → store lookup (public shape)
   - `analytics_summary({ days? })` → summarize()
   - `credit_balance({})` → for the authed account (OAuth token → Clerk user → account), or `{anonymous: true}` when auth disabled
   - `buy_credits({ pack })` → returns `{ checkout_url }` via Stripe checkout (or `stripe_not_configured`)
2. Auth wrapping: when `authEnabled()` and `CLERK_SECRET_KEY` present, wrap with `experimental_withMcpAuth`-style verification using `verifyClerkToken` from `@clerk/mcp-tools/next` (follow that package's documented Next.js pattern; read its README in node_modules). Token audience/resource validation before tool dispatch. When auth is disabled (demo/HF), serve tools 1–4 unauthenticated and 5–6 return a `sign_in_required` message.
3. `/.well-known/oauth-protected-resource`: use `protectedResourceHandlerClerk` from `@clerk/mcp-tools/next` when Clerk configured (authorization server = Clerk instance domain); else a static JSON `{resource:"https://ailerix.com", authorization_servers:[]}`.
4. `.env.example`: note Clerk OAuth: enable Dynamic Client Registration (or CIMD) in the Clerk dashboard; register Cursor redirect URLs `https://www.cursor.com/agents/mcp/oauth/callback` and `http://localhost:8787/callback`.
5. Tests: tool registry lists 6 tools; route_preview returns a valid family on the fixture (memory mode, auth disabled).

Gate: `npx tsc --noEmit && npm test && npm run build`; live: `curl -X POST http://127.0.0.1:43147/api/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` returns the tool list (auth-disabled mode).

## G7 — Cursor Marketplace plugin

**Files.** Create under `cursor-plugin/`: `.cursor-plugin/plugin.json`, `mcp.json`, `skills/ailerix-routing/SKILL.md`, `skills/ailerix-credits/SKILL.md`, `agents/jev-router.md`, `hooks/hooks.json`, `assets/logo.svg`, `README.md`. Also repo-root `.cursor-plugin/marketplace.json` listing the plugin with `source: "cursor-plugin"`.

- `plugin.json`: name `ailerix`, description, version `0.1.0`, author, homepage `https://ailerix.com`, repository, license MIT, logo relative path.
- `mcp.json`: `{"mcpServers": {"ailerix": {"url": "https://ailerix.com/api/mcp"}}}` (Cursor drives OAuth via DCR/CIMD).
- Skills: frontmatter `name` matching folder + `description` stating what AND when ("Use when the user wants to route an LLM request without picking a model…"). Routing skill: ailerix/auto contract, policy hints, families, `model_not_allowed` gotcha, MCP tools available. Credits skill: balance/topup/402 semantics, ACP note.
- `agents/jev-router.md`: frontmatter name/description ("Consult Ailerix for a typed routing decision before long LLM tasks; use proactively when choosing how to process a prompt"), body: call `route_preview`, interpret family/floor, then act.
- `hooks/hooks.json`: `beforeMCPExecution` matcher for the ailerix server with a fail-closed script `scripts/guard-mcp.sh` that allows known tool names and denies others (exit 2).
- README: install (marketplace + local `~/.cursor/plugins/local/ailerix`), configuration, OAuth notes.

Gate: `jq` parses every JSON; skill frontmatter names match folders; no absolute paths in manifests.

## G8 — Hugging Face Space (orchestrator, direct)

Docker-SDK Space `tylerjharden/ailerix` on cpu-basic: `Dockerfile` (multi-stage: `node:22-alpine`, `npm ci && npm run build`, `next start -p 7860`), Space README frontmatter (`sdk: docker`, `app_port: 7860`), demo mode = no secrets (auth disabled path from G1, memory analytics, echo execution). Push via `hf` CLI upload from a scratch dir containing the repo (no `.env`).

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
