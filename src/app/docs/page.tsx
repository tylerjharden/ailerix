import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FAMILY_DESCRIPTIONS, TASK_FAMILIES } from "@/lib/families";

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/v1/route",
    body:
      "Jev + frontier walk. Send { prompt, policy? }. Returns family, aa_id, cost_per_task_usd, floor, fallback_aa_id, decisions, mock output. model is always ailerix/auto.",
  },
  {
    method: "POST",
    path: "/api/v1/systemone",
    body: "Jev-compatible System One endpoint. Send state + typed questions.",
  },
  {
    method: "POST",
    path: "/api/v1/chat/completions",
    body:
      "OpenAI-shaped chat. model must be omitted or ailerix/auto; any other slug returns 400 model_not_allowed.",
  },
  {
    method: "GET",
    path: "/api/v1/models",
    body:
      "Returns only ailerix/auto — the sole public model id. No provider catalog.",
  },
] as const;

const familyCriteriaExample = Object.fromEntries(
  TASK_FAMILIES.map((family) => [family, FAMILY_DESCRIPTIONS[family]]),
);

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-3xl font-medium tracking-tight">Docs</h1>
        <p className="text-muted-foreground">
          Ailerix speaks two contracts: OpenRouter-style chat, and TypeSafe
          System One. Jev classifies task families; software walks the frontier.
        </p>
      </div>

      <div className="grid gap-3">
        {ENDPOINTS.map((endpoint) => (
          <Card key={endpoint.path} size="sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge>{endpoint.method}</Badge>
                <CardTitle className="font-mono text-sm">{endpoint.path}</CardTitle>
              </div>
              <CardDescription>{endpoint.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>TypeScript: routing questions (task family)</CardTitle>
          <CardDescription>
            Production routing uses nine questions — one Choice over families, three
            Scores, five Nouls. No catalog ids in criteria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto font-mono text-xs leading-6 text-muted-foreground">{`const familyCriteria = ${JSON.stringify(familyCriteriaExample, null, 2)};

const response = await fetch("/api/v1/systemone", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    state: "Refund this double charge before payroll.",
    model: "jev-latest",
    questions: {
      task_family: {
        type: "choice",
        instructions:
          "Classify the user's request into exactly one task family.",
        criteria: familyCriteria,
      },
      quality_floor: {
        type: "score",
        instructions: "How much model quality does this task need?",
        legend: [
          "Trivial rewrite or lookup",
          "Standard production task",
          "Hard multi-step reasoning",
          "Frontier-only work",
        ],
      },
      hallucination_sensitive: {
        type: "noul",
        instructions:
          "Would a confident falsehood be expensive here?",
      },
    },
  }),
});

const { answers } = await response.json();
console.log(answers.task_family.choice, answers.task_family.confidence);`}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chat completions: ailerix/auto only</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto font-mono text-xs leading-6 text-muted-foreground">{`const response = await fetch("/api/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "ailerix/auto",
    messages: [{ role: "user", content: "Summarize this ticket." }],
    policy: "balanced",
  }),
});

// Omitting model is also accepted.
// Any other model slug → 400 { code: "model_not_allowed" }
// Body fields models, provider, plugins, preset → 400 parameter_not_allowed

const body = await response.json();
console.log(body.model); // "ailerix/auto"
console.log(body.ailerix?.family, body.ailerix?.cost_per_task_usd);`}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Jev vs local engine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            If <code className="font-mono text-foreground">TYPESAFE_API_KEY</code>{" "}
            is set, Ailerix calls{" "}
            <code className="font-mono text-foreground">
              POST https://api.typesafe.ai/v1/systemone
            </code>{" "}
            with model <code className="font-mono text-foreground">jev-latest</code>.
          </p>
          <p>
            Without a key, Ailerix uses a local System One engine that returns
            the same Choice / Score / Noul shapes so you can develop against
            the typed contract. Completions stay mocked either way until you
            add provider credentials.
          </p>
        </CardContent>
      </Card>

      <section id="mcp" className="scroll-mt-8 space-y-6">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl font-medium tracking-tight">Agents &amp; MCP</h2>
          <p className="text-muted-foreground">
            Connect Cursor, Claude Desktop, or any MCP client to route prompts,
            inspect generations, and manage credits without leaving your editor.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>MCP endpoint</CardTitle>
            <CardDescription>
              Streamable HTTP transport with OAuth protected resources.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Base URL:{" "}
              <a
                href="https://ailerix.com/api/mcp"
                className="break-all font-mono text-foreground underline-offset-4 hover:underline"
              >
                https://ailerix.com/api/mcp
              </a>
            </p>
            <p>
              OAuth uses Clerk with dynamic client registration (DCR). Cursor
              registers automatically when you add the server. Read-only tools
              (discovery and analytics summaries) work without a token;
              routing, completions, and credit purchases require a signed-in
              session or bearer token from the OAuth flow.
            </p>
            <p>
              Anonymous callers get 25 routed requests per day. Paid and signed-in
              usage draws from your credit balance; exhausted credits return{" "}
              <code className="font-mono text-foreground">402</code> with{" "}
              <code className="font-mono text-foreground">insufficient_credits</code>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tools</CardTitle>
            <CardDescription>
              Six MCP tools exposed on the live server.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Tool</th>
                  <th className="py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/60">
                  <td className="py-2 pr-4 font-mono text-xs text-foreground">
                    route_preview
                  </td>
                  <td className="py-2">
                    Classify a prompt and return the frontier walk preview (family,
                    floor, fallback) without charging a completion.
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 pr-4 font-mono text-xs text-foreground">
                    create_completion
                  </td>
                  <td className="py-2">
                    Run a routed completion for a prompt and optional policy;
                    returns a generation id for follow-up.
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 pr-4 font-mono text-xs text-foreground">
                    get_generation
                  </td>
                  <td className="py-2">
                    Fetch status and output for a prior generation by id.
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 pr-4 font-mono text-xs text-foreground">
                    analytics_summary
                  </td>
                  <td className="py-2">
                    Aggregated spend, tokens, and family breakdown for the
                    authenticated account (optional days window).
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 pr-4 font-mono text-xs text-foreground">
                    credit_balance
                  </td>
                  <td className="py-2">
                    Current USD credit balance for the signed-in user.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs text-foreground">
                    buy_credits
                  </td>
                  <td className="py-2">
                    Start checkout for a credit pack (requires auth and Stripe).
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Discovery &amp; machine-readable docs</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {[
                {
                  href: "https://ailerix.com/.well-known/mcp/server-card.json",
                  label: "MCP server card",
                },
                {
                  href: "https://ailerix.com/.well-known/oauth-protected-resource",
                  label: "OAuth protected resource",
                },
                {
                  href: "https://ailerix.com/.well-known/agent-card.json",
                  label: "Agent card",
                },
                {
                  href: "https://ailerix.com/.well-known/agent-skills/index.json",
                  label: "Agent skills index",
                },
                {
                  href: "https://ailerix.com/.well-known/ai-catalog.json",
                  label: "AI catalog",
                },
                {
                  href: "https://ailerix.com/.well-known/acp.json",
                  label: "ACP (agent checkout)",
                },
                {
                  href: "https://ailerix.com/openapi.json",
                  label: "OpenAPI",
                },
                {
                  href: "https://ailerix.com/auth.md",
                  label: "auth.md",
                },
                {
                  href: "https://ailerix.com/llms.txt",
                  label: "llms.txt",
                },
              ].map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="break-all text-primary underline-offset-4 hover:underline"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              <code className="font-mono text-foreground">/.well-known/acp.json</code>{" "}
              describes Agentic Commerce Protocol checkout so agents can purchase
              credit packs on your behalf after OAuth consent.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>List tools (curl)</CardTitle>
            <CardDescription>
              JSON-RPC over streamable HTTP — read tools work without auth on
              open deployments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto font-mono text-xs leading-6 text-muted-foreground">{`curl -sS -X POST https://ailerix.com/api/mcp \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cursor plugin</CardTitle>
            <CardDescription>
              Prebuilt MCP wiring and skills for the Ailerix repo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="https://github.com/tylerjharden/ailerix/tree/main/cursor-plugin"
              className="text-sm text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              github.com/tylerjharden/ailerix/tree/main/cursor-plugin
            </a>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
