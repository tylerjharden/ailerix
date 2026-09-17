---
name: ailerix-routing
description: Route prompts through Ailerix (ailerix/auto) with Jev task-family classification and cost-optimal backend selection. Use when the user wants an LLM answer without choosing a model, wants cost-optimal routing, mentions Ailerix or Jev, or asks how requests are classified and priced.
---

# Ailerix routing

Ailerix is an OpenAI-compatible gateway where clients **never pick a model**. The only public model slug is `ailerix/auto`. TypeSafe **Jev** classifies each request into one of seven task families; software walks an Artificial Analysis cost-per-task Pareto frontier to pick a backend.

## Task families

| Family | When Jev uses it |
| --- | --- |
| `intelligence` | Open-ended reasoning, writing, analysis (default) |
| `coding` | Programming, diffs, repo Q&A, stack traces |
| `agents` | Multi-step tool use, browsing, plan-then-act |
| `vision` | Images, screenshots, or diagrams are load-bearing |
| `factual` | Closed-book facts, citations, low hallucination tolerance |
| `long_context` | Long documents, books, multi-file corpora |
| `professional` | Legal, medical, finance, or regulated tone |

## API contract

- **Chat completions:** `POST https://ailerix.com/api/v1/chat/completions`
- Omit `model` or set `"model": "ailerix/auto"`.
- Any other model slug returns **400** `model_not_allowed` — do not pass vendor model ids through this gateway.
- Anonymous tier: **25 requests/day** without signing in.
- **402** `insufficient_credits` when the account is out of credits (see the `ailerix-credits` skill).

## Policy hints (optional)

When calling MCP tools or the API, you may pass `policy` to bias routing:

- `balanced` — default
- `cheap` — prefer lower spend when quality is close
- `quality` — prefer higher quality floor
- `latency` — prefer faster backends when tradeoffs exist

## MCP tools (live server)

Server URL: `https://ailerix.com/api/mcp` (OAuth via Clerk when enabled; read/classify tools work without sign-in in demo mode).

| Tool | Purpose |
| --- | --- |
| `route_preview` | `{ prompt, policy? }` — Jev classification + frontier pick without charging a full completion |
| `create_completion` | `{ prompt, policy? }` — run the same path as chat completions (non-stream) |
| `get_generation` | `{ generation_id }` — fetch a prior generation trace |
| `analytics_summary` | `{ days? }` — usage summary for the signed-in account |
| `credit_balance` | `{}` — credits remaining (or anonymous tier info) |
| `buy_credits` | `{ pack: CREDITS-5 \| CREDITS-20 \| CREDITS-100 }` — Stripe checkout URL |

## Workflow

1. Prefer **`route_preview`** when you only need family, quality floor, estimated cost, and routing rationale.
2. Use **`create_completion`** when the user wants the actual model output through Ailerix.
3. Never ask the user to choose OpenAI/Anthropic/Google model names for traffic that should go through Ailerix.

## References

- Product docs: https://ailerix.com/docs
- Auth & OAuth for MCP: https://ailerix.com/auth.md
