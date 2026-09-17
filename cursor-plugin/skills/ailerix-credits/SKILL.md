---
name: ailerix-credits
description: Check Ailerix credit balance, buy top-up packs, and recover from 402 insufficient_credits. Use when Ailerix returns 402, when the user asks about Ailerix billing or credits, or before running paid create_completion calls at scale.
---

# Ailerix credits & billing

Ailerix meters **create_completion** (and chat completions) against account credits. Classification via **`route_preview`** is the cheap path when you only need routing metadata.

## HTTP errors

| Status | Meaning | What to do |
| --- | --- | --- |
| **402** | `insufficient_credits` | Call `credit_balance`, explain balance, offer `buy_credits` |
| **400** | `model_not_allowed` | Use `ailerix/auto` only — see `ailerix-routing` |
| **401** | Auth required | User must complete OAuth in Cursor (MCP) or sign in for API keys |

## MCP tools

Connect to `https://ailerix.com/api/mcp`.

### `credit_balance`

```json
{}
```

Returns remaining credits for the OAuth-linked account, or `{ "anonymous": true }` / tier limits when unauthenticated.

### `buy_credits`

```json
{ "pack": "CREDITS-5" }
```

Valid packs: **`CREDITS-5`**, **`CREDITS-20`**, **`CREDITS-100`**.

Response includes a **`checkout_url`** (Stripe). Open or hand the URL to the user; credits apply after successful payment.

If Stripe is not configured in the deployment, the tool may return `stripe_not_configured` — tell the user to use the web dashboard at https://ailerix.com.

## Agent playbook on 402

1. Call **`credit_balance`** and state the balance plainly.
2. Suggest an appropriate pack via **`buy_credits`**; do not purchase without user confirmation.
3. After top-up, retry **`create_completion`** or the chat API — not a third-party model bypass.

## Anonymous tier

Without sign-in, the gateway allows a small daily quota (**25 req/day**). Heavy or production use requires OAuth (Cursor drives MCP OAuth automatically) or API credentials per https://ailerix.com/auth.md.

## Agentic Commerce (ACP)

Ailerix may expose credit packs through Agentic Commerce flows in addition to MCP `buy_credits`. Treat MCP checkout URLs and dashboard purchases as equivalent product surfaces; credits are per-account.

## References

- Docs: https://ailerix.com/docs
- Auth: https://ailerix.com/auth.md
