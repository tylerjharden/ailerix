# Ailerix

Type-safe model router. An OpenRouter competitor that uses TypeSafe Jev (System One) to bank each request to a typed route — model, fallback, policy — instead of asking you (or a chat model) to pick a string.

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

A working slice:

- Landing, playground, catalog, and docs
- `POST /api/v1/systemone` — Jev-compatible Choice / Score / Noul API
- `POST /api/v1/route` — policy in, typed route out
- `POST /api/v1/chat/completions` — OpenAI-shaped entry with `ailerix/auto`
- Local System One engine so the playground works without credentials

If `TYPESAFE_API_KEY` is set, routing questions go to `https://api.typesafe.ai/v1/systemone`. Completions stay mocked until you add provider keys.

## Run locally

```bash
npm install
npm run dev -- --port 43147
```

Open [http://127.0.0.1:43147](http://127.0.0.1:43147).
