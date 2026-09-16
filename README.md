# Ailerix

Type-safe model router. An OpenRouter competitor that uses TypeSafe Jev (System One) to classify every request, then walks an [Artificial Analysis](https://artificialanalysis.ai) cost-per-task Pareto chain to bank a provider. You never name a model. The only public slug is `ailerix/auto`.

- Site: [ailerix.com](https://ailerix.com)
- Source: [github.com/tylerjharden/ailerix](https://github.com/tylerjharden/ailerix)
- Product spec: [docs/SPEC.md](./docs/SPEC.md)
- Implementation plan: [docs/PLAN.md](./docs/PLAN.md)

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

A working slice plus the product contract:

- Landing, playground, catalog, and docs
- `POST /api/v1/systemone` — Jev-compatible Choice / Score / Noul API
- `POST /api/v1/route` — policy hint in, typed route out
- `POST /api/v1/chat/completions` — OpenAI-shaped entry; use `ailerix/auto` only
- Local System One engine so the playground works without credentials

The shipped router still Choice-ranks a twelve-row catalog. That path is deleted in the spec. Jev will classify **task families** only (`intelligence`, `coding`, `agents`, `vision`, `factual`, `long_context`, `professional`). Software then picks the cheapest Artificial Analysis cost-per-task point that clears Jev’s quality floor, stepping one point up the frontier when confidence is low.

If `TYPESAFE_API_KEY` is set, routing questions go to `https://api.typesafe.ai/v1/systemone`. Completions stay mocked until you add provider keys. Live AA ingest needs a Commercial license; development uses a fixture (see the plan).

## Run locally

```bash
npm install
npm run dev -- --port 43147
```

Open [http://127.0.0.1:43147](http://127.0.0.1:43147).
