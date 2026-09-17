# OpenRouter feature-parity matrix

Every feature found in the live OpenRouter docs (full-docs research pass, ~40 pages across the core API and platform surfaces), with its disposition in Ailerix. Companion to [SPEC.md](./SPEC.md) (the contract) and [PLAN.md](./PLAN.md) / [HANDOFF.md](./HANDOFF.md) (sequencing).

**Statuses**

- **Done** — implemented and tested in this repo.
- **Partial** — the wire accepts it, but behavior is incomplete; the gap is named.
- **E-slice** — being implemented in the execution/analytics slice (WP-E1…E5).
- **F-later** — planned, not yet scheduled; matrix row only.
- **Dropped** — deliberately not cloned; contradicts Jev-owned routing (SPEC § cited).

Ailerix's philosophy in one line: OpenRouter is a marketplace with optional routing; Ailerix is mandatory routing with a hidden marketplace. Everything that lets a client pick a model, provider, or price tier is Dropped. Everything that makes the OpenAI-compatible wire richer or the pipeline observable is cloned.

## 1. Core request contract — `POST /api/v1/chat/completions`

| Feature | OpenRouter contract | Ailerix status | Disposition |
| --- | --- | --- | --- |
| `messages` (string + content parts) | OpenAI message array; text/image/file/audio/video parts | Done (string + text/image parts) | Done |
| `prompt` (non-chat string) | Legacy alternative to `messages`; `NonChatChoice.text` | Missing | F-later |
| `model` slug | Provider-prefixed slug; account default when omitted | **Locked**: `ailerix/auto` or omitted; else 400 `model_not_allowed` | Done (by design, SPEC §6.1) |
| `models[]` fallbacks | Priority list; next model on any failure | Rejected 400 `parameter_not_allowed` | Dropped (SPEC §3.3) — Ailerix computes fallbacks from the frontier |
| Variant suffixes `:nitro` `:floor` `:exacto` `:free` `:batch` | Routing/catalog shortcuts on any slug | Rejected with the slug | Dropped (SPEC §3.3) — latency/cost pressure comes from Jev scores |
| Assistant prefill | Trailing `assistant` message continues | Missing | F-later (adapter passthrough) |
| `temperature`, `top_p`, `max_tokens`, `stop`, `seed` | Forwarded; provider defaults when absent | Partial — accepted, not forwarded (mock) | E-slice (WP-E1/E2 forward to providers) |
| `top_k`, `min_p`, `top_a`, `repetition_penalty`, `frequency/presence_penalty`, `logit_bias`, `logprobs` | Normalized across providers | Missing | F-later (forward where supported) |
| `response_format` json_object / json_schema | Schema enforcement, per-endpoint support | Partial — accepted, ignored | E-slice (passthrough); enforcement + healing F-later |
| `tools`, `tool_choice`, `parallel_tool_calls` | OpenAI function calling, transformed per provider | Partial — accepted, ignored | E-slice (passthrough to adapters) |
| `prediction` (predicted outputs) | Latency optimization | Missing | F-later |
| `reasoning` object (`effort`, `max_tokens`, `exclude`) | Unified reasoning control + `reasoning_details[]` | Partial — accepted, ignored | E-slice (effort passthrough); details echo F-later |
| `stream` (SSE) | OpenAI chunks, `[DONE]`, keep-alive comments, final usage chunk | Done (mock content); E-slice for real provider streams | E-slice |
| `stream_options.include_usage` | Deprecated no-op (usage always returned) | Usage always returned | Done |
| `usage` accounting fields | Native token counts, `cached_tokens`, `reasoning_tokens`, `cost`, `cost_details` | Partial — char-count fakes | E-slice (real provider usage + `estimated_turn_usd`) |
| `transforms` / `context-compression` plugin | Middle-out prompt truncation | Missing | F-later |
| `user` / `safety_identifier` | End-user abuse isolation id | Missing | F-later (with API keys) |
| `session_id` sticky routing | Cache-affinity provider pinning | Missing | F-later (after prompt caching) |
| `trace` observability metadata | Passed to broadcast destinations | Missing | F-later |
| `service_tier` | priority/flex tier endpoints | Missing | Dropped for clients (tiering is a provider preference); internal use possible later |
| `provider` preferences object | order/only/ignore/sort/quantizations/max_price/zdr | Rejected 400 | Dropped (SPEC §3.3) — capability filters come from Jev Nouls |
| `plugins[]` (user-facing) | auto-router, web, file-parser, response-healing config | Rejected 400 | Dropped as client control (SPEC §3.3); equivalents may exist server-side |
| `preset` / `@preset/` slugs | Server-stored request configs | Rejected 400 | Dropped (SPEC §3.3) |
| Attribution headers (`HTTP-Referer`, `X-Title`) | App rankings + analytics | Accepted, unused | F-later (analytics dimension only; no public rankings) |
| `X-OpenRouter-Metadata` routing snapshot | Pipeline metadata on responses | Ailerix `ailerix` trace object is always on | Done (richer than parity) |
| Policy hint `policy` | — (no OpenRouter equivalent) | Done — biases Jev Scores only | Done (Ailerix-native) |

## 2. Response contract

| Feature | OpenRouter | Ailerix status | Disposition |
| --- | --- | --- | --- |
| OpenAI completion / chunk shapes | `choices[]`, `finish_reason`, `native_finish_reason` | Done (mock); real finish_reason mapping in E-slice | E-slice |
| Resolved `model` echoed | Response reveals the routed slug | Hidden: `model: "ailerix/auto"`; reveal header opt-in | Done (by design, SPEC §6.5); reveal header E-slice |
| `provider` field | Serving provider name | Hidden by default | Dropped publicly; in `RouteEvent` + reveal |
| `usage` with cost fields | Always returned; `cost`, `cost_details`, cached/reasoning details | Partial | E-slice |
| `reasoning` / `reasoning_details[]` | Plaintext + structured CoT blocks | Missing | F-later |
| `annotations[]` (files, citations) | PDF/file + web-search citations | Missing | F-later (with file/web features) |
| Generation id (`gen-…`, `X-Generation-Id` header) | Correlate every response | Missing | E-slice (`X-Ailerix-Generation-Id`) |
| Mid-stream error chunk (HTTP stays 200) | `error` + `finish_reason: "error"` | Missing | E-slice (WP-E2) |
| Zero completion insurance | No charge on zero-token/error responses | N/A (no billing) | F-later (with credits) |

## 3. Routing (the product core)

| Feature | OpenRouter | Ailerix | Disposition |
| --- | --- | --- | --- |
| `openrouter/auto` | ~30-task classifier → `cost_tier` band → 7-day spend-share sampling | **Replaced**: Jev Choice over 7 task families + Scores/Nouls; deterministic AA cost-per-task Pareto walk | Done (SPEC §3.5) |
| Auto-router config (`allowed_models`, `excluded_models`, `cost_tier`) | Client narrows the auto space | None — clients get no routing knobs | Dropped (SPEC §4.3) |
| `openrouter/free` | Free-models-only router | None | Dropped — cost pressure is `cost_sensitivity`, not a tier |
| Pareto Router plugin | Coding-score tier picker | **Replaced** by the family frontier walker (all families, floor + gradient + `nextUp`) | Done |
| Fusion / Body Builder / latest-alias / Auto Exacto routers | Multi-model deliberation, request synthesis, `~latest` aliases | None | F-later (Fusion-style deliberation is interesting for `professional`); aliases meaningless without slugs |
| Default provider load balancing | Inverse-price² weighting + 30s outage avoidance | Provider health filter planned in walker eligibility | E-slice (key-aware) + F-later (health probes) |
| Uptime-based deprioritization | Rolling 5-min latency/throughput percentiles | `ttft_ms` in AA snapshot; live health F-later | F-later |
| Private models | BYO deployment scoped to orgs | None | F-later (enterprise) |

## 4. Multimodal & media

| Feature | OpenRouter | Ailerix | Disposition |
| --- | --- | --- | --- |
| Image input (`image_url`) | URL/base64 on any vision model | Done at ingest (routes to `vision` family); provider forwarding in E-slice | E-slice |
| PDF/file input + file-parser plugin | mistral-ocr / cloudflare-ai / native engines, reusable annotations | Missing | F-later |
| Audio input (`input_audio`) | base64, priced as input tokens | Missing | F-later |
| Video input (`video_url`) | Provider-specific | Missing | F-later |
| Audio output (`modalities`) | Voice + format config, stream-only | Missing | F-later |
| Image generation (`POST /v1/images` + models listing) | Dedicated endpoint, per-image billing | Missing | F-later |
| TTS / STT endpoints | `/audio/speech`, `/audio/transcriptions` | Missing | F-later |
| Video generation (async jobs) | Submit → poll → download | Missing | F-later |
| Embeddings / rerank | `/v1/embeddings`, `/v1/rerank` | Missing | F-later |

## 5. Caching, sessions, batching

| Feature | OpenRouter | Ailerix | Disposition |
| --- | --- | --- | --- |
| Prompt caching (Anthropic `cache_control`, OpenAI auto/explicit, Gemini implicit) | Per-provider translation + `cached_tokens` accounting | Missing | F-later (adapter passthrough first) |
| Sticky routing / `session_id` | Provider pinning for cache hits | Missing | F-later |
| Response caching | Identical-request full-response cache | Missing | F-later |
| Batch API (`:batch`) | Async batch pricing | Missing | F-later |

## 6. API skins & discovery

| Feature | OpenRouter | Ailerix | Disposition |
| --- | --- | --- | --- |
| `POST /api/v1/chat/completions` | Primary skin | Done | Done |
| `POST /api/v1/responses` (OpenAI Responses, stateless) | Second skin | Missing | F-later |
| `POST /api/v1/messages` (Anthropic skin) | Third skin | Missing | F-later |
| `POST /api/v1/completions` (legacy) | Text completions | Missing | F-later |
| `GET /api/v1/models` (+filters, pagination, pricing objects) | Full catalog discovery | **One row**: `ailerix/auto` | Done (by design, SPEC §6.4) |
| `GET /models/:author/:slug/endpoints` | Per-provider endpoints, uptime, percentiles | None publicly; operator `GET /api/v1/internal/catalog` | Done (internal only) |
| `GET /api/v1/generation?id=` | Post-hoc stats: native tokens, cost, latency, ttft, routing context | Missing | E-slice (WP-E5) |
| OpenAPI spec published | openapi.yaml | Missing | F-later |
| System One passthrough `POST /api/v1/systemone` | — (no equivalent) | Done | Done (Ailerix-native) |
| Typed route `POST /api/v1/route` | — (no equivalent) | Done | Done (Ailerix-native) |

## 7. Errors, limits, insurance

| Feature | OpenRouter | Ailerix | Disposition |
| --- | --- | --- | --- |
| Error envelope `{error:{code,message,metadata}}` | HTTP-mirrored codes; `metadata.provider_name`, `raw` | Partial — envelope + 2 codes | E-slice (taxonomy) |
| Typed `error_type` values (~25) | Stable across skins | Missing | E-slice (core 6) + F-later (full set) |
| Moderation / guardrail 403s | Reasons + flagged input | Missing | F-later |
| Rate limits (free tiers, surge) + `GET /api/v1/key` | Credit + request regimes, headers | Missing | F-later (with API keys) |
| `Retry-After` on 429/503 | Standard | Missing | F-later |
| Zero completion insurance | Auto no-charge | N/A | F-later (with billing) |

## 8. Keys, auth, billing, privacy

| Feature | OpenRouter | Ailerix | Disposition |
| --- | --- | --- | --- |
| Runtime API keys + per-key limits | Bearer keys, credit caps | Missing (API is open) | F-later (SPEC §11 — before real spend by others) |
| Management API (keys/analytics/guardrails/workspaces/SCIM) | Admin key surface | Missing | F-later (analytics subset lands in E-slice) |
| OAuth PKCE user keys | User-controlled key issuance | Missing | F-later |
| Workload identity federation | JWT → short-lived tokens | Missing | F-later |
| BYOK (5% fee, prioritized keys) | User provider keys | Missing | F-later — conflicts partially with hidden providers; needs design |
| Credits, fees, refunds, invoices | Prepaid USD credits | Missing | F-later |
| ZDR / data_collection / in-region routing | Per-request + account enforcement | Missing | F-later (enterprise) |
| Guardrails (budgets, PII, regex, model allowlists) | Policy objects on keys/members | Missing | F-later — model allowlists will stay operator-side only |
| Opt-in logging discount | 1% discount | Missing | Dropped (no incentive to log prompts) |

## 9. Analytics & observability

| Feature | OpenRouter | Ailerix | Disposition |
| --- | --- | --- | --- |
| Activity dashboard (spend/tokens/requests, grouping, CSV/PDF export) | Dashboard page | Mock data today | E-slice (real store + Overview/Logs/Observability); export F-later |
| `GET /api/v1/activity` + analytics query API | Management-key endpoints | Missing | E-slice (`/api/v1/analytics/summary`, `/events`, operator-gated) |
| Generation-level stats | `GET /generation` | Missing | E-slice |
| Per-request pipeline metadata | `X-OpenRouter-Metadata` opt-in | `ailerix` trace always-on; RouteEvent persistence in E-slice | E-slice |
| Classifiers (async tagging of traffic) | Custom taxonomies post-hoc | **Native**: every request is Jev-classified inline; families are first-class analytics dimensions | Done (superior parity) |
| Broadcast destinations (Datadog, Langfuse, …) | Per-workspace trace fan-out | Missing | F-later |
| Public rankings / datasets / task market share | Spend-share leaderboards | None | Dropped — spend share is explicitly not a routing signal (SPEC §3.5); may publish family-mix stats later |
| Benchmarks API (AA + Design Arena aggregation) | `GET /api/v1/benchmarks` | AA snapshot is the routing input itself | Done (internal); public benchmarks endpoint F-later (license-gated) |

## 10. Server tools, agents, ecosystem

| Feature | OpenRouter | Ailerix | Disposition |
| --- | --- | --- | --- |
| Server tools (web_search, web_fetch, shell/bash containers, apply_patch, advisor, subagent, fusion…) | Model-invoked hosted tools with loop caps | Missing | F-later — `advisor`/`subagent` map naturally onto the frontier (`nextUp` as advisor) |
| Web search engines + citations | Exa/native/parallel, `url_citation` | Missing | F-later |
| Files API + containers | Upload once, reference by id | Missing | F-later |
| Presets CRUD API | Server-stored configs | None | Dropped (SPEC §3.3) |
| MCP server | Hosted MCP with model/routing tools | Missing | F-later (an Ailerix MCP exposing route/analytics is a good fit) |
| First-party SDKs / Terraform | TS/Python/Go clients | Missing | F-later (OpenAI SDK baseURL swap works today) |
| Ori agent harness + Vault | Agent fleet product | Missing | Out of scope |

## Agent readiness (isitagentready.com)

Scanned after the G-slice deploy: **Level 5/5 — Agent-Native**, 14/17 checks passing.

- Passing: robots.txt (+ AI bot rules + Content-Signal), sitemap, Link headers, markdown negotiation, API catalog (RFC 9727), OAuth discovery (RFC 8414 proxy → Clerk), OAuth protected resource (RFC 9728), MCP server card, A2A agent card, agent-skills index, ARD ai-catalog, ACP discovery.
- Failing, deliberate: `dnsAid` (needs `_agents` SVCB/HTTPS DNS records + DNSSEC at the registrar), `webMcp` (experimental in-page `navigator.modelContext` API), `authMd` (scanner wants the `agent_auth` block on the AS advertised first in PRM — Clerk's own metadata, which we don't control; our origin proxy serves it).

## Summary counts

- Done (incl. by-design locks and native replacements): 15
- Partial → E-slice now: 12
- F-later: ~45
- Dropped by design: 12

The E-slice closes the two gaps that make Ailerix *not a product yet*: requests never reach a real model, and decisions are never persisted or surfaced. Everything else is additive once those exist.
