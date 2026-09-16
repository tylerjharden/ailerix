# Ailerix

Type-safe model router. An OpenRouter competitor that uses TypeSafe Jev (System One) to classify every request, then walks an [Artificial Analysis](https://artificialanalysis.ai) cost-per-task Pareto chain to bank a provider. You never name a model. The only public slug is `ailerix/auto`.

- Site: [ailerix.com](https://ailerix.com)
- Source: [github.com/tylerjharden/ailerix](https://github.com/tylerjharden/ailerix)
- Product spec: [docs/SPEC.md](./docs/SPEC.md)
- Implementation plan: [docs/PLAN.md](./docs/PLAN.md)
- OpenRouter feature-parity matrix: [docs/FEATURES.md](./docs/FEATURES.md)

An aileron banks an aircraft. Ailerix banks a request.

## Name and domain

**Use `ailerix.com`.** GoDaddy classified it as a standard registration, not premium or aftermarket. Verisign RDAP returned 404 for the name, which means it is not delegated.

Matching standard-available names:

- [ailerix.com](https://www.godaddy.com/domainsearch/find?domainToCheck=ailerix.com&key=gd_mcp_server&itc=gd_mcp_server)
- [ailerix.dev](https://www.godaddy.com/domainsearch/find?domainToCheck=ailerix.dev&key=gd_mcp_server&itc=gd_mcp_server)
- [ailerix.io](https://www.godaddy.com/domainsearch/find?domainToCheck=ailerix.io&key=gd_mcp_server&itc=gd_mcp_server)
- [ailerix.ai](https://www.godaddy.com/domainsearch/find?domainToCheck=ailerix.ai&key=gd_mcp_server&itc=gd_mcp_server)
- [ailerix.net](https://www.godaddy.com/domainsearch/find?domainToCheck=ailerix.net&key=gd_mcp_server&itc=gd_mcp_server)
- [ailerix.app](https://www.godaddy.com/domainsearch/find?domainToCheck=ailerix.app&key=gd_mcp_server&itc=gd_mcp_server)

Cheap path: buy `.com` first. GoDaddy first-year `.com` is promotional (often under $12; renewal is about $23). `.dev` is typically about $16 the first year. `.io` and `.ai` are standard but not cheap.

Nearby spellings that are **not** this name: Ailixr, Alierix, Ailix, Aileron. No USPTO record was found for the exact mark AILERIX.

## What this repo is

A working slice of the product contract:

- Landing, playground, **Families** page, docs, and a mock dashboard
- `POST /api/v1/systemone` — Jev-compatible Choice / Score / Noul API
- `POST /api/v1/route` — policy hint in; Jev classifies task family; frontier walker returns `aa_id`, cost-per-task, floor, and reasons
- `POST /api/v1/chat/completions` — OpenAI-shaped entry; only `ailerix/auto` (or omitted model) is accepted
- `GET /api/v1/models` — single row: `ailerix/auto`
- Checked-in Artificial Analysis fixture (`data/aa-snapshot.json`) and Pareto frontier walker (no live scrape in dev)
- Local System One engine so the playground works without credentials

Jev classifies **task families** only (`intelligence`, `coding`, `agents`, `vision`, `factual`, `long_context`, `professional`) — never catalog model ids in routing questions. Software picks the cheapest cost-per-task frontier point that clears Jev’s quality floor, with optional next-up when confidence or gradient warrants it.

If `TYPESAFE_API_KEY` is set, routing questions go to `https://api.typesafe.ai/v1/systemone`. Completions stay mocked until you add provider keys. Live AA ingest needs a Commercial license; development uses the fixture (see the plan).

## Run locally

```bash
npm install
npm run dev -- --port 43147
```

Open [http://127.0.0.1:43147](http://127.0.0.1:43147).
