# Ailerix for Cursor

Connect Cursor to the [Ailerix](https://ailerix.com) OpenAI-compatible gateway. Clients never choose a backend model—only **`ailerix/auto`**. TypeSafe **Jev** classifies each request into a task family and software selects a cost-optimal model on an Artificial Analysis Pareto frontier.

## Install

### Cursor Marketplace

When this repository is published as a marketplace plugin, install **ailerix** from the Cursor plugin marketplace. Cursor loads `mcp.json`, skills, agents, and hooks from the bundle.

### Local development

Copy or symlink this folder to:

`~/.cursor/plugins/local/ailerix`

Restart Cursor (or reload plugins). The manifest lives at `.cursor-plugin/plugin.json` inside the package.

## Configuration

No API keys are required in the plugin manifest. MCP is defined in `mcp.json`:

```json
{
  "mcpServers": {
    "ailerix": {
      "url": "https://ailerix.com/api/mcp"
    }
  }
}
```

### OAuth

When Clerk OAuth is enabled on the deployment, Cursor discovers authorization via OAuth protected-resource metadata and completes login through Dynamic Client Registration (or CIMD). **You do not paste tokens into `mcp.json`.**

Read-oriented tools (`route_preview`, `analytics_summary` in demo mode, etc.) may work **without** sign-in depending on server configuration. Tools that spend credits (`create_completion`, `buy_credits`, account `credit_balance`) require a signed-in user.

See https://ailerix.com/auth.md for dashboard setup and redirect URLs.

## MCP tools

| Tool | Description |
| --- | --- |
| `route_preview` | Classify `prompt` with optional `policy`; returns family, frontier pick, cost estimate |
| `create_completion` | Full non-stream completion through the same path as `/api/v1/chat/completions` |
| `get_generation` | Look up a prior generation by id |
| `analytics_summary` | Usage summary (`days` optional) |
| `credit_balance` | Remaining credits for the authenticated account |
| `buy_credits` | Start checkout for `CREDITS-5`, `CREDITS-20`, or `CREDITS-100` |

Live endpoint: **https://ailerix.com/api/mcp**

## HTTP API (optional)

Agents and scripts can also call:

`POST https://ailerix.com/api/v1/chat/completions`

Use `ailerix/auto` or omit `model`. Other slugs return **400** `model_not_allowed`.

## Skills & agents

- **`ailerix-routing`** — when to use `ailerix/auto`, families, policies, MCP overview
- **`ailerix-credits`** — balance, top-ups, **402** handling
- **`jev-router`** agent — run `route_preview` before large LLM work

## Security hook

`hooks/hooks.json` registers `beforeMCPExecution` with `failClosed: true` for server `ailerix`. `scripts/guard-mcp.sh` allowlists the six tools above and blocks unknown tool names.

## Links

- Docs: https://ailerix.com/docs
- Auth: https://ailerix.com/auth.md
- Repository: https://github.com/tylerjharden/ailerix
- License: MIT
