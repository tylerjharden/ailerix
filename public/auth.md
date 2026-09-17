# Agent authentication and credits

This guide is for autonomous agents, MCP clients, and API integrators using [Ailerix](https://ailerix.com).

## Tiers

### Anonymous (no credentials)

- Use `POST https://ailerix.com/api/v1/chat/completions` and `POST https://ailerix.com/api/v1/route` without an `Authorization` header.
- Limit: **25 requests per UTC day** per client (tracked via anonymized id). When exceeded, the API returns **429** with `code: rate_limit_exceeded` and `metadata.error_type: rate_limit_exceeded`.
- Best for demos, smoke tests, and read-only exploration. Not for production workloads.

### API keys (server-to-server)

1. Sign in at https://ailerix.com/dashboard (Clerk when auth is configured).
2. Open **API Keys**, create a key, and store the full `ailerix_…` secret immediately (shown once).
3. Send `Authorization: Bearer ailerix_<secret>` on every request.
4. Check balance and label: `GET https://ailerix.com/api/v1/key` (bearer required).

New accounts receive a **$1.00 signup grant** (free-tier balance). Usage debits apply after completions based on estimated turn cost (with a small margin). Invalid or revoked keys return **401** with `WWW-Authenticate: Bearer resource_metadata="https://ailerix.com/.well-known/oauth-protected-resource"`.

### OAuth (MCP and interactive agents)

The streamable HTTP MCP endpoint is `https://ailerix.com/api/mcp`. When Clerk is configured, tools that spend credits or read account state require an OAuth access token issued by your Clerk authorization server. Resource metadata is published at `https://ailerix.com/.well-known/oauth-protected-resource` (dynamic when Clerk is enabled).

Tools `route_preview`, `create_completion`, `get_generation`, and `analytics_summary` are usable in demo mode without auth; `credit_balance` and `buy_credits` require sign-in when auth is enabled.

## HTTP semantics you must handle

| Status | Code | When |
| --- | --- | --- |
| 402 | `insufficient_credits` | Account balance cannot cover the estimated debit before execution |
| 429 | `rate_limit_exceeded` | Anonymous daily cap |
| 400 | `model_not_allowed` | Any `model` other than omitted or `ailerix/auto` |
| 400 | `parameter_not_allowed` | Body contains `models`, `provider`, `plugins`, or `preset` |
| 502 | `provider_unavailable` | Provider execution failed after fallback |

Payment-required responses use `metadata.error_type: payment_required`.

## Buying credits

Humans can buy packs in the dashboard (**Credits** tab) via Stripe Checkout when `STRIPE_SECRET_KEY` is configured.

Agents can use **ACP** (Agentic Commerce Protocol) when enabled: protocol discovery at `https://ailerix.com/.well-known/acp.json`, checkout API under `https://ailerix.com/api/acp`, and the MCP tool `buy_credits` for a hosted checkout URL.

Credit packs (USD): **$5**, **$20**, and **$100** — grants are applied to the buyer's account ledger on successful payment.

## Contract reminders

- Only public model id: `ailerix/auto`.
- Routing traces may include `aa_id` and `family`; provider slugs are hidden unless you send `x-ailerix-reveal-route: 1`.
- OpenAPI: https://ailerix.com/openapi.json
- MCP server card: https://ailerix.com/.well-known/mcp/server-card.json
