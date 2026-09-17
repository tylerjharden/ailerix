# Ailerix operator setup

What is configured, what is not, and exactly what to do. The app degrades gracefully — every missing secret disables one capability without breaking the rest.

## Current state

| Capability | Status | Blocking secret |
| --- | --- | --- |
| Routing + echo execution + analytics (Neon) | **Live** on ailerix.com | none |
| Anonymous tier (25 routes/day) | **Live** | none |
| Sign-up / sign-in / dashboard accounts | **Off** in production (dev works via Clerk Keyless) | `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| API keys + credit metering UI | Off until Clerk is on | same as above |
| Credit purchases (Stripe Checkout) | Off (buttons disabled) | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |
| ACP agent checkout (SPT charge) | Endpoints live; charge declines | `STRIPE_SECRET_KEY` |
| Real frontier-model execution | Echo-only | any provider key |
| Live Jev (vs local heuristics) | Local engine | `TYPESAFE_API_KEY` |
| OAuth on the MCP server | Discovery live; token verification off | Clerk keys |
| DNS-AID `_agents` records | **Live** (Vercel DNS; no DNSSEC on Vercel) | none |
| Hugging Face demo Space | **Live** | none |
| Cursor Marketplace listing | Package ready; needs your submission | none |

## 1. Clerk (auth) — ~5 minutes

A keyless Clerk app already exists (instance `evolved-lacewing-5181.clerk.accounts.dev`) and this repo's dev server uses it. Claim it so you own it:

1. Open the claim link: `https://dashboard.clerk.com/apps/claim?token=yyvwxdcw1azskmpx5vdlil0l8ev9yj2kboe7asjp` (sign in / create a free Clerk account). If the link has expired, just create a new application at dashboard.clerk.com instead — nothing else changes.
2. In the Clerk dashboard → **API keys**, copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_…`) and `CLERK_SECRET_KEY` (`sk_…`).
3. Set both (see §5 for where). **Set them together** — the publishable key alone makes the middleware expect a secret and 500s.
4. For the MCP OAuth chain: Clerk dashboard → **OAuth applications** → enable **Dynamic client registration** (or ask Clerk support to enable CIMD), and add these redirect URLs for Cursor: `https://www.cursor.com/agents/mcp/oauth/callback` and `http://localhost:8787/callback`.
5. Later, for a custom-domain production instance (`clerk.ailerix.com` cookies), create a production instance in Clerk and add the DNS records it asks for. The dev instance works on ailerix.com in the meantime.
6. Update `CLERK_OAUTH_AS_DOMAIN` (already set on Vercel to the keyless instance) if your instance domain changes.

## 2. Stripe (credits) — ~10 minutes

1. In the [Stripe dashboard](https://dashboard.stripe.com/test/apikeys) (test mode first), copy the **secret key** → `STRIPE_SECRET_KEY`.
2. Create a webhook endpoint: Developers → Webhooks → Add endpoint → URL `https://ailerix.com/api/stripe/webhook`, event `checkout.session.completed`. Copy the **signing secret** → `STRIPE_WEBHOOK_SECRET`.
   - Alternative: put `STRIPE_SECRET_KEY` in the Cursor agent env and ask the agent to create the webhook endpoint via the API.
3. No products needed — checkout uses inline `price_data` for the three packs (`CREDITS-5/20/100`).
4. ACP shared-payment-token charges use the same `STRIPE_SECRET_KEY` (preview API version `2026-04-22.preview`). Getting real SPTs requires applying to OpenAI's Instant Checkout program separately.
5. Go live later by swapping test keys for live keys.

## 3. Provider + Jev keys (optional, any subset)

`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` (or `GEMINI_API_KEY`), `DEEPSEEK_API_KEY`, `XAI_API_KEY`, `DASHSCOPE_API_KEY`, `TYPESAFE_API_KEY`. Each key widens routing eligibility automatically; zero keys means echo-only execution.

## 4. Optional hardening

- `AILERIX_OPERATOR_KEY` — gates `/api/v1/internal/catalog` and `/api/v1/analytics/events` in production (header `x-ailerix-operator`).
- `ACP_WEBHOOK_SECRET` / `ACP_ORDER_WEBHOOK_URL` / `ACP_SIGNING_KEY` — ACP order webhooks + request signature verification (needed for real OpenAI integration).

## 5. Where to set env vars

**Vercel (production + preview):** Vercel dashboard → ailerix project → Settings → Environment Variables, or:

```bash
npx vercel env add CLERK_SECRET_KEY production
```

Already set on Vercel: `DATABASE_URL` (Neon), `CLERK_OAUTH_AS_DOMAIN`. Redeploy after adding keys (`npx vercel deploy --prod`).

**Cursor Cloud Agents (this dev environment):** cursor.com dashboard → Cloud Agents → **Secrets** → add the same names (repo-scoped to ailerix). They inject as env vars into future agent runs so the agent can verify Stripe/Clerk/provider flows for you.

**Local dev:** `.env` (gitignored). Clerk Keyless already covers auth in dev.

## 6. Cursor Marketplace plugin

The package lives in [`cursor-plugin/`](../cursor-plugin/) (manifest `.cursor-plugin/plugin.json`, remote MCP at `https://ailerix.com/api/mcp`, two skills, the `jev-router` subagent, a fail-closed MCP guard hook), with the repo-root `.cursor-plugin/marketplace.json` indexing it.

To test locally: copy `cursor-plugin/` to `~/.cursor/plugins/local/ailerix/`, reload Cursor, check Customize → your skills/agent/MCP appear.

To publish: submit the repository at **cursor.com/marketplace/publish** (requires your Cursor account). The marketplace is curated — every plugin is manually reviewed, so expect direct contact from the Cursor team. Prereq: enable DCR in Clerk (§1.4) so Cursor's automatic OAuth works at install.

## 7. DNS

`_index._agents`, `_mcp._agents`, and `_a2a._agents` HTTPS records now exist on Vercel DNS pointing at `ailerix.com` with `alpn=h2`. Vercel DNS does not support DNSSEC, so the scanner's dnsAid check may still report the zone unsigned — full marks there require moving DNS to a DNSSEC-capable provider (e.g. Cloudflare) and is not otherwise load-bearing.

## 8. Hugging Face

The demo Space is live at [huggingface.co/spaces/tylerjharden/ailerix](https://huggingface.co/spaces/tylerjharden/ailerix) (free static Space calling the production API via CORS). A Docker Space running the full app requires HF PRO on your account; if you upgrade, ask the agent to convert it.
