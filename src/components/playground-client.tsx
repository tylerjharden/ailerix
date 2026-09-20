"use client";

import { useMemo, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { TaskFamily } from "@/lib/families";
import { ROUTING_POLICIES, type RoutingPolicy } from "@/lib/models";
import type { Answer, SystemOneResponse } from "@/lib/system-one";

type RouteResponse = {
  model: string;
  family: TaskFamily;
  family_confidence: number;
  aa_id: string;
  cost_per_task_usd: number;
  floor: number;
  fallback_aa_id: string;
  fallback: string;
  next_up_used: boolean;
  degraded: boolean;
  engine: "jev" | "ailerix-local";
  policy: RoutingPolicy;
  latency_ms: number;
  reasons: string[];
  output: string;
  decisions: SystemOneResponse;
  error?: string;
};

const EXAMPLES: { label: string; policy: RoutingPolicy; prompt: string }[] = [
  {
    label: "Refund ticket",
    policy: "latency",
    prompt:
      "Customer: I was charged twice for the annual plan. Cancel and refund today. This is blocking payroll.",
  },
  {
    label: "TypeScript refactor",
    policy: "cheap",
    prompt:
      "Refactor this TypeScript router so model ids are a discriminated union and the default branch uses a never check.",
  },
  {
    label: "Screenshot QA",
    policy: "balanced",
    prompt:
      "Look at this checkout screenshot (checkout.png) and tell me whether the pay button is disabled after submit.",
  },
];

function policyLabel(policy: RoutingPolicy): string {
  switch (policy) {
    case "cheap":
      return "Minimize spend";
    case "balanced":
      return "Best overall value";
    case "quality":
      return "Highest quality";
    case "latency":
      return "Lowest latency";
    default: {
      const _exhaustive: never = policy;
      throw new Error(`Unhandled policy: ${_exhaustive}`);
    }
  }
}

function familyLabel(family: TaskFamily): string {
  return family.replace(/_/g, " ");
}

function AnswerCard({ id, answer }: { id: string; answer: Answer }) {
  switch (answer.type) {
    case "choice":
      return (
        <Card size="sm">
          <CardHeader>
            <CardDescription>Choice · {id}</CardDescription>
            <CardTitle className="font-mono text-sm">{answer.choice}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <p className="text-muted-foreground">
              Confidence {(answer.confidence * 100).toFixed(0)}%
            </p>
            {Object.entries(answer.probabilities)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <span className="truncate font-mono">{key}</span>
                  <span>{(value * 100).toFixed(1)}%</span>
                </div>
              ))}
          </CardContent>
        </Card>
      );
    case "score":
      return (
        <Card size="sm">
          <CardHeader>
            <CardDescription>Score · {id}</CardDescription>
            <CardTitle className="font-mono text-sm">
              {answer.score.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>Confidence {(answer.confidence * 100).toFixed(0)}%</p>
            <p>
              {Array.isArray(answer.legend) ? answer.legend.join(" → ") : ""}
            </p>
          </CardContent>
        </Card>
      );
    case "noul":
      return (
        <Card size="sm">
          <CardHeader>
            <CardDescription>Noul · {id}</CardDescription>
            <CardTitle className="font-mono text-sm">
              P(yes) {answer.noul.toFixed(3)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Confidence {(answer.confidence * 100).toFixed(0)}%
          </CardContent>
        </Card>
      );
    default: {
      const _exhaustive: never = answer;
      throw new Error(`Unhandled answer type: ${_exhaustive}`);
    }
  }
}

export function PlaygroundClient() {
  const [prompt, setPrompt] = useState(EXAMPLES[0].prompt);
  const [policy, setPolicy] = useState<RoutingPolicy>("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RouteResponse | null>(null);

  const empty = !loading && !result && !error;

  const selectedExample = useMemo(
    () => EXAMPLES.find((example) => example.prompt === prompt),
    [prompt],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim()) {
      setError("Enter a prompt or load an example.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, policy }),
      });
      const payload = (await response.json()) as RouteResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Routing failed");
      }
      setResult(payload);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "Routing failed");
    } finally {
      setLoading(false);
    }
  }

  const fallbackId = result?.fallback_aa_id ?? result?.fallback;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Request</CardTitle>
          <CardDescription>
            Jev classifies task family and scores; software walks the
            cost-per-task frontier. No model select — only a policy hint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <Button
                  key={example.label}
                  type="button"
                  size="sm"
                  variant={selectedExample?.label === example.label ? "default" : "outline"}
                  onClick={() => {
                    setPrompt(example.prompt);
                    setPolicy(example.policy);
                  }}
                >
                  {example.label}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt">State</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={9}
                placeholder="Paste a ticket, prompt, or program state."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy">Policy hint</Label>
              <Select
                value={policy}
                onValueChange={(value) => {
                  if ((ROUTING_POLICIES as readonly string[]).includes(value)) {
                    setPolicy(value as RoutingPolicy);
                  }
                }}
              >
                <SelectTrigger id="policy" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUTING_POLICIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item} — {policyLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Asking Jev
                </>
              ) : (
                "Route with Jev"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Route failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {empty ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No route yet</CardTitle>
              <CardDescription>
                Submit a request to see the task family Jev chose, the frontier
                pick (aa_id and cost-per-task), and the full typed decisions.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {result ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="capitalize">
                    {familyLabel(result.family)}
                  </Badge>
                  <Badge variant="secondary">
                    {(result.family_confidence * 100).toFixed(0)}% family conf.
                  </Badge>
                  {result.next_up_used ? (
                    <Badge variant="outline">next_up used</Badge>
                  ) : null}
                  {result.degraded ? (
                    <Badge variant="destructive">degraded</Badge>
                  ) : null}
                  <Badge variant="outline">{result.policy}</Badge>
                  <Badge variant="secondary">
                    {result.engine === "jev" ? "TypeSafe Jev" : "Local Jev"}
                  </Badge>
                  <Badge variant="secondary">{result.latency_ms} ms</Badge>
                </div>
                <CardTitle className="font-mono text-base">{result.model}</CardTitle>
                <CardDescription>
                  Quality floor {result.floor.toFixed(1)} · Frontier pick{" "}
                  <span className="font-mono text-foreground">{result.aa_id}</span>{" "}
                  at ${result.cost_per_task_usd.toFixed(4)}/task · Fallback{" "}
                  <span className="font-mono text-foreground">{fallbackId}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {result.reasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
              </CardContent>
            </Card>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(result.decisions.answers).map(([id, answer]) => (
                <AnswerCard key={id} id={id} answer={answer} />
              ))}
            </div>
            <details className="rounded-lg border border-border bg-card px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">
                Raw decisions JSON
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto font-mono text-xs leading-6 text-muted-foreground">
                {JSON.stringify(result.decisions, null, 2)}
              </pre>
            </details>
            <Card>
              <CardHeader>
                <CardTitle>Mock completion</CardTitle>
                <CardDescription>
                  The route is real. The string below is only a stand-in so the
                  playground works without provider keys.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-muted-foreground">
                  {result.output}
                </pre>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
