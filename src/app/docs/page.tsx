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
    </div>
  );
}
