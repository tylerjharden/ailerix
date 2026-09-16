# Ailerix implementation plan

This plan implements [SPEC.md](./SPEC.md). It sequences work by dependency and risk, not by calendar. Each phase has an exit gate. Do not start a later phase until the gate is green unless a later phase is explicitly a parallel track.

Jev classifies. Software walks the Artificial Analysis cost-per-task Pareto chain. Clients never name a model.

## 0. Current baseline (do not treat as the product)

Shipped today:

- Next.js app on `ailerix.com` / `127.0.0.1:43147`
- `POST /api/v1/route`, `/systemone`, `/chat/completions`
- Local System One engine + optional TypeSafe Jev
- Twelve-row hand catalog; Jev Choice over catalog ids
- `rankByPolicy` on `$ / MTok`, star quality, latency
- Completions mocked
- Playground still implies “Jev picks a model”

This plan *replaces* the Choice-over-catalog path. It does not wrap it.

## 1. Principles for every phase

- No catalog id in any Jev `criteria` object.
- No public path that accepts a provider slug as `model` except as a 400.
- AA data enters through a typed snapshot. No HTML scrape.
- Exhaustive `switch` on `TaskFamily`, `RoutingPolicy`, and Jev answer types.
- Imports stay at module top.
- Do not add auth, a second component library, or a marketplace UI.
- Commit and push when a phase gate is met.

## 2. Phase map

```
P1  Types + delete catalog Choice
P2  AA snapshot fixture + Pareto builder
P3  Walker (quality floor, nextUp, latency band)
P4  Wire /route and /chat/completions
P5  Public API lock (ailerix/auto only, dummy /models)
P6  Playground + docs + landing copy
P7  Local Jev heuristics for the new question set
P8  Tests (walker, API 400s, Jev contract)
——  gate: spec §12 items 1–6, 8–9 on fixture data
P9  Provider adapters (real completions)
P10 AA API ingest + license gate
P11 Reveal header, usage, fallback execution
P12 Keys, spend caps (only when money moves)
```

P1–P8 is the first complete product slice. P9–P12 are the paid/production slice.

---

## Phase 1 — Types and the Jev contract

**Why first.** Every later file imports these types. Deleting the catalog Choice now prevents new code from depending on it.

### Work

1. Add `src/lib/families.ts`:
   - `TASK_FAMILIES = ["intelligence","coding","agents","vision","factual","long_context","professional"]`
   - `TaskFamily`, `isTaskFamily`
2. Replace `routingQuestions(policy)` so Choice criteria are the seven families. Scores: `quality_floor`, `cost_sensitivity`, `latency_sensitivity`. Nouls: spec §5.5. Fold the policy hint into Score *instructions* only.
3. Delete `rankByPolicy`’s use of Jev model probabilities as catalog ids.
4. Keep `CatalogModel` only as an operator/debug row. Do not feed it to Jev.
5. `RouteDecision` gains `family`, `aa_id`, `cost_per_task_usd`, `next_up_used`. `model` on the public wire becomes `ailerix/auto`; keep an internal `provider_slug` for adapters.

### Exit gate

- `routingQuestions` stringified contains none of `openai/`, `anthropic/`, `google/`, `deepseek/`, `qwen/`, `meta-llama/`, `mistral/`, `x-ai/`, `ailerix/echo`.
- `tsc --noEmit` clean.
- `/systemone` still answers arbitrary caller questions (do not break the passthrough).

---

## Phase 2 — AA snapshot fixture and Pareto builder

**Why.** The walker needs a frontier. The AA API is licensed; a fixture unblocks everything else.

### Work

1. `src/lib/aa/types.ts` — `AaModelSnapshot`, `AaFrontierPoint`, `AaSnapshot` from spec §7.2.
2. `data/aa-snapshot.json` — fixture. Source: publicly stated Index / cost-per-task figures only, tagged `license: "missing"`. Cover ≥ 8 models across at least `intelligence` and `coding`, including a vision-capable and a tools-capable row. Include `ailerix/echo-local` as a $0 / quality-floor sink so the walker never returns empty.
3. `src/lib/aa/load.ts` — `loadSnapshot()` from the JSON file. Later: env override `AA_SNAPSHOT_PATH`.
4. `src/lib/aa/pareto.ts`:
   - `frontier(models, family) → AaFrontierPoint[]`
   - `gradient` as Δquality / Δcost
   - Drop dominated points
5. `src/lib/aa/join.ts` — `openrouter_api_id` or `provider_slug` → adapter key.

### Exit gate

- Unit tests: a dominated expensive/worse point is dropped; equal-cost higher-quality wins; empty family score falls back to `intelligence` cost-per-task; `echo-local` never dominates a real model on quality.
- Fixture parses against the Zod (or hand) schema.
- No network calls.

---

## Phase 3 — Walker

**Why.** This is the product. Spec §7.4–§7.5.

### Work

1. `src/lib/aa/floor.ts` — map Jev `quality_floor` expected value + hallucination Noul onto snapshot percentiles.
2. `src/lib/aa/walk.ts` — `walkFrontier({ snapshot, family, scores, nouls }) → { pick, fallback, next_up_used, reasons[] }`.
3. Constants: `SLOPE_WORTH_IT` (default: median positive gradient on that family), `LATENCY_BAND = 0.15`, `ε = 1e-4`.
4. Capability filters from Nouls (spec §5.5).
5. Degraded path: if nothing clears the floor, take `frontier.last` and reason `degraded_best_available`.

### Exit gate

- Table tests (fixture ids, not live AA):

  | Setup | Expect |
  | --- | --- |
  | Simple chat, floor ~0, cost_sensitivity high | Cheapest intelligence point |
  | Coding Noul high, vision low | A coding-capable model; not a vision-only cheap row |
  | Floor ~3 | Highest-quality eligible, still min cost among those ≥ floor |
  | Family confidence 0.40 | `next_up_used === true` |
  | `cost_sensitivity` 0.2 and steep gradient | Steps up once |
  | `latency_sensitivity` 2.5 | May pick a slightly costlier point inside 15% band with better TTFT |
  | Vision Noul 0.9 | Every candidate has `capabilities.vision` |
  | No eligible | `echo-local` or degraded last + explicit reason |

- Walker never reads `process.env` for model ids.

---

## Phase 4 — Wire routing endpoints

**Why.** Types + walker exist; the HTTP layer still speaks the old `decision.model.id` catalog shape.

### Work

1. `routeRequest`:
   - Call Jev with the new question set.
   - `assertAnswerType` on each id in spec §5.
   - `task_family.choice` must be `isTaskFamily` or fall back to `intelligence` with reason `unknown_family`.
   - Call `walkFrontier`.
   - Reasons cite family, floor, cost-per-task, gradient step — not “Jev picked gpt-…”.
2. `POST /api/v1/route` response:
   - `model: "ailerix/auto"`
   - `aa_id`, `family`, `cost_per_task_usd`, `fallback_aa_id`, `next_up_used`, `engine`, `decisions`, `reasons`
   - Internal `provider_slug` only inside `ailerix` if reveal is off — prefer omit.
3. `POST /api/v1/chat/completions`:
   - Reject non-`ailerix/auto` model slugs (Phase 5 can land in the same PR if small).
   - Mocked assistant text may say *what family and cost-per-task were banked*, not “routed to anthropic/…”, unless reveal is on.

### Exit gate

- Playground-equivalent `curl` to `/route` returns a family and `ailerix/auto`.
- `decisions.answers.task_family.choice` is a family key.
- No response body on the default path contains a provider slug (grep test).

---

## Phase 5 — Public API lock

**Why.** Spec §3.3 / §6. If this slips, SDKs will hardcode slugs again.

### Work

1. `POST /chat/completions`: `model` omitted or `ailerix/auto`. Else 400 `model_not_allowed`.
2. Reject `models`, `provider`, `plugins`, `preset`.
3. `GET /api/v1/models` returns only `ailerix/auto` (spec §6.4).
4. Keep a private `GET /api/v1/internal/catalog` behind `x-ailerix-operator` or `NODE_ENV !== "production"` so operators can still see the snapshot.
5. Error envelope: `{ error: { message, type, code } }`.

### Exit gate

- Tests: 400 for `openai/gpt-5.4`, `openrouter/auto`, `openrouter/free`, `models: []`, `provider: {}`.
- 200 for omitted `model` and `ailerix/auto`.
- Public `/models` JSON length === 1.

---

## Phase 6 — Surfaces

**Why.** The current site still teaches catalog shopping.

### Work

1. Landing: three beats — Jev classifies / AA cost-per-task / you never name a model. Remove any “pick from 12 models” framing.
2. Playground: delete model selection if any remains. Show family probabilities, floor, picked cost-per-task, whether `nextUp` fired, fallback family-point. Policy stays a hint selector.
3. `/models` page: families + how the frontier works. Snapshot table is clearly “fixture / operator,” not a storefront.
4. `/docs`: replace the System One example that Choices over `claude-haiku` / `gpt-5-mini`. Show `task_family` + Scores. Completions example uses `model: "ailerix/auto"` only.
5. README: link SPEC + PLAN; describe Jev + Pareto, not “typed route to a model string.”

### Exit gate

- Grep `src/app` and `README.md` for “Select the single best model” / catalog Choice examples: zero.
- Empty, loading, and error states still exist on the playground.
- Desktop and mobile layouts of playground and landing verified in a browser (or computer-use pass).

---

## Phase 7 — Local System One heuristics

**Why.** Without `TYPESAFE_API_KEY`, the new Choice keys would otherwise get uniform / garbage weights.

### Work

1. Retune `answerQuestion` so Choice over *families* uses `PromptSignals` (code → `coding`, image → `vision`, long → `long_context`, tools/agent language → `agents`, cite/legal → `factual` / `professional`, else `intelligence`).
2. Score heuristics: length + code + urgent map onto the 0–3 legends. Policy hint in instructions still tilts cheap / quality / latency.
3. Noul heuristics already exist; map the new ids onto the same signal tests.
4. Do not special-case catalog names in haystacks.

### Exit gate

- Golden prompts:
  - “refund this double charge” → `intelligence` or `professional`, not `coding`
  - stack trace + `function` → `coding`
  - “what’s in this screenshot” → `vision` Noul ≥ 0.7
  - 8k-char paste → `long_context` Noul high
- Confidence in `[0,1]`. Exhaustive default `never` remains.

---

## Phase 8 — Automated tests

**Why.** The walker is easy to regress by “helpfully” putting a slug back into Jev.

### Work

1. `src/lib/aa/*.test.ts` — Phase 2–3 tables.
2. `src/lib/system-one.test.ts` — `routingQuestions` has no catalog ids; local engine returns the right types.
3. `src/app/api/v1/chat/completions/route.test.ts` — 400/200 matrix from Phase 5.
4. `src/lib/router.test.ts` — integration with fixture + local engine (no network).

Prefer Node’s built-in test runner or Vitest — pick one and stick to it. Do not add a second framework.

### Exit gate (slice complete)

Spec §12 items 1–6, 8–9 pass on fixture data. Item 7 is “fixture, no scrape” until Phase 10.

**Commit, push, and stop.** Real providers are a separate slice.

---

## Phase 9 — Provider adapters

**Why.** Routing is real; answers are still mocked.

### Work

1. `src/lib/providers/types.ts` — `complete({ slug, messages, stream, tools, … })`.
2. Adapters: OpenAI, Anthropic, Google, one cheap open-weight host. Map `provider_slug` from the snapshot join.
3. If the banked adapter lacks a key, try `fallback` once, then 502 `provider_unavailable`.
4. Streaming: convert provider SSE to OpenAI chunks. Last event may include `ailerix` trace.
5. Do not let adapter errors leak a “try model X instead” suggestion to the client.

### Exit gate

- One live prompt through `ailerix/auto` with a real key returns upstream tokens.
- Missing key → fallback or typed 502, never a hang.
- `usage` tokens populated from the provider.

---

## Phase 10 — Live Artificial Analysis ingest

**Why.** Fixture is methodology-correct but stale. Production claims need a license.

### Work

1. Obtain AA Commercial license and written consent for model-selection use. **Hard stop** if refused — stay on fixture, do not scrape, do not imply a partnership.
2. `src/lib/aa/fetch.ts` — API v2, `x-api-key: $AA_API_KEY`. Map fields onto `AaModelSnapshot`. Persist to Vercel KV / filesystem cache / `data/aa-snapshot.generated.json`.
3. Join `openrouter_api_id` → our adapter slugs. Fail a model *out* of eligibility if we cannot execute it; do not serve an AA winner we cannot call.
4. Cron or `after` hook: refresh at least daily. On failure, last-good snapshot + metric.
5. Marketing: only after license, “Decision uses Artificial Analysis cost-per-task and Intelligence Index.”

### Exit gate

- Snapshot `license: "commercial"` in production.
- Refresh failure does not empty the frontier.
- No HTML fetchers in the repo.

---

## Phase 11 — Reveal, usage, fallback execution

### Work

1. `X-Ailerix-Reveal-Route: 1` and account flag (flag needs Phase 12 keys).
2. `ailerix.estimated_turn_usd` from token prices × usage; keep `cost_per_task_usd` as the AA item.
3. Automatic one-shot fallback on timeout / 5xx from the banked provider.
4. Optional Responses API (`POST /api/v1/responses`) only if a concrete client needs it. Do not build it speculatively.

### Exit gate

- Default body `model === "ailerix/auto"`.
- Reveal body `model === provider_slug`.
- Timeout path uses `fallback_aa_id` and sets `ailerix.used_fallback: true`.

---

## Phase 12 — Tenancy when money moves

Do not implement until provider keys are live and someone other than the operator will send traffic.

- `ailerix_…` API keys
- Per-key spend cap
- Audit log of family + aa_id + cost-per-task (not full prompts by default)
- TypeSafe + AA keys remain server-only

---

## 3. Parallel tracks (safe to overlap)

| Track | Can overlap with | Cannot start before |
| --- | --- | --- |
| Docs/landing copy drafts | P1–P3 | — |
| Fixture curation | P1 | — |
| Test harness install | P1 | — |
| Provider adapter spikes | P3 | P1 (need slugs off the public API) |
| AA license conversation | any | — (blocking for P10 claims) |
| TypeSafe production key | P7 | — |

Do not spike a catalog UI or an OpenRouter-compatible `provider` object. That work is rejected by spec §2.

---

## 4. Risks

| Risk | Mitigation |
| --- | --- |
| AA license refused | Stay on fixture; copy says “methodology / fixture.” Walker code unchanged. |
| AA family cost-per-task missing | Fall back to intelligence item, then synthetic token estimate marked `synthetic: true` (loses ties). |
| Jev down | Local engine. Same question set. |
| Client SDKs send `gpt-4o` by habit | Hard 400 + docs snippet. Do not silently remap. |
| Frontier empty after filters | `echo-local` / degraded last. Never throw through to a random catalog row. |
| Gradient explosion on tiny Δcost | `ε` floor; cap gradient for `SLOPE_WORTH_IT` comparison. |
| Snapshot drift vs adapters | Ineligible if we cannot call it. |
| Current playground teaches slugs | P6 deletes that copy in the same slice as P4. |

---

## 5. Explicitly out of scope until asked

- OpenRouter provisioning / management API
- Plugin marketplace (`web`, `file-parser` as OpenRouter plugins)
- Multi-model compare UI
- Fine-tune hosting
- Billing ledger / invoices
- Mobile native apps
- Buying `ailerx.com` or other near-miss domains

---

## 6. Suggested first commit series (P1–P8)

One commit per phase is enough. Do not bundle P9 keys into the contract rewrite.

1. `feat: jev classifies task families, not catalog ids`
2. `feat: artificial analysis snapshot fixture and pareto builder`
3. `feat: cost-per-task frontier walker`
4. `feat: route and completions use the walker`
5. `feat: reject client model slugs; dummy /models`
6. `docs: product surfaces match jev + pareto`
7. `feat: local system one heuristics for families`
8. `test: walker, jev contract, completions lock`

After commit 8, the repo *is* the product on fixture data. Provider keys and AA Commercial are follow-on work, not prerequisites for calling the slice done.
