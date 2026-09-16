import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/v1/route",
    body: "Jev-powered route. Send { prompt, policy }. Get model, fallback, decisions, mock output.",
  },
  {
    method: "POST",
    path: "/api/v1/systemone",
    body: "Jev-compatible System One endpoint. Send state + typed questions.",
  },
  {
    method: "POST",
    path: "/api/v1/chat/completions",
    body: "OpenAI-shaped chat. Use model ailerix/auto to let Jev pick.",
  },
  {
    method: "GET",
    path: "/api/v1/models",
    body: "Catalog with pricing, latency, and capabilities.",
  },
] as const;

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-3xl font-medium tracking-tight">Docs</h1>
        <p className="text-muted-foreground">
          Ailerix speaks two contracts: OpenRouter-style chat, and TypeSafe
          System One. The second one is the product.
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
          <CardTitle>TypeScript: ask Jev, then switch</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto font-mono text-xs leading-6 text-muted-foreground">{`const response = await fetch("/api/v1/systemone", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    state: "Refund this double charge before payroll.",
    model: "jev-latest",
    questions: {
      model: {
        type: "choice",
        instructions: "Which catalog model should handle this?",
        criteria: {
          "anthropic/claude-haiku-4.5": "Fast support routing",
          "openai/gpt-5-mini": "Cheap default",
        },
      },
      urgent: { type: "noul", instructions: "Is this time-sensitive?" },
    },
  }),
});

const { answers } = await response.json();

switch (answers.model.type) {
  case "choice":
    console.log(answers.model.choice, answers.model.confidence);
    break;
  case "score":
  case "noul":
    throw new Error("model must be a Choice");
  default: {
    const _exhaustive: never = answers.model;
    throw new Error(\`Unhandled \${_exhaustive}\`);
  }
}`}</pre>
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
