import Link from "next/link";
import { ArrowRight, GitBranch, Layers, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STEPS = [
  {
    title: "Jev classifies the task",
    body:
      "TypeSafe Jev answers Choice, Score, and Noul questions — including which task family fits. No catalog ids in the criteria. No model names in the output.",
  },
  {
    title: "Software walks the cost-per-task frontier",
    body:
      "Ailerix maps Jev’s quality floor onto an Artificial Analysis Pareto chain, picks the cheapest point that clears it, and steps one notch up when confidence is low.",
  },
  {
    title: "You never name a model",
    body:
      "The only public slug is ailerix/auto. Frontier picks use internal aa_id values; provider routing stays behind the API.",
  },
] as const;

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Task families + AA frontier</Badge>
          <Badge variant="outline">OpenAI-compatible API</Badge>
        </div>
        <div className="max-w-3xl space-y-5">
          <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
            Jev classifies. Software walks the frontier. You send{" "}
            <code className="font-mono text-[0.9em]">ailerix/auto</code>.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            Ailerix is a type-safe router powered by TypeSafe Jev. Jev does not
            chat — it returns typed decisions in milliseconds. Your code (and
            our frontier walker) turns those values into a cost-per-task pick
            along the Artificial Analysis snapshot.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/playground">
                Try the playground
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/docs">Read the typed API</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-card/40">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-10 sm:grid-cols-3 sm:px-6">
          <Card size="sm">
            <CardHeader>
              <Sparkles className="size-4 text-primary" />
              <CardTitle>Seven task families</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Intelligence, coding, agents, vision, factual, long context, and
              professional — Jev picks exactly one. Brand names in the prompt
              are capability hints, not model selections.
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <Layers className="size-4 text-primary" />
              <CardTitle>Pareto cost-per-task</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Per family, models sit on a quality–cost frontier. Software
              applies Jev’s floor, chooses the cheapest clearing point, and can
              next-up when confidence or gradient says so.
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <GitBranch className="size-4 text-primary" />
              <CardTitle>One public model id</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Chat and route endpoints accept only{" "}
              <code className="font-mono text-foreground">ailerix/auto</code>.
              Fallback aa_id is chosen on the same frontier — still no provider
              slug in the default response.
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-medium tracking-tight">How a request banks</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Card key={step.title}>
              <CardHeader>
                <CardDescription>0{index + 1}</CardDescription>
                <CardTitle>{step.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {step.body}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Name and domain</CardTitle>
            <CardDescription>
              An aileron banks an aircraft. Ailerix banks a request. The exact
              mark is unused; nearby spellings are different companies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Register the cheap standard name first:{" "}
              <a
                className="text-foreground underline-offset-4 hover:underline"
                href="https://www.godaddy.com/domainsearch/find?domainToCheck=ailerix.com&key=gd_mcp_server&itc=gd_mcp_server"
              >
                ailerix.com
              </a>
              . Matching{" "}
              <a
                className="text-foreground underline-offset-4 hover:underline"
                href="https://www.godaddy.com/domainsearch/find?domainToCheck=ailerix.dev&key=gd_mcp_server&itc=gd_mcp_server"
              >
                .dev
              </a>
              ,{" "}
              <a
                className="text-foreground underline-offset-4 hover:underline"
                href="https://www.godaddy.com/domainsearch/find?domainToCheck=ailerix.io&key=gd_mcp_server&itc=gd_mcp_server"
              >
                .io
              </a>
              , and{" "}
              <a
                className="text-foreground underline-offset-4 hover:underline"
                href="https://www.godaddy.com/domainsearch/find?domainToCheck=ailerix.ai&key=gd_mcp_server&itc=gd_mcp_server"
              >
                .ai
              </a>{" "}
              are also standard-available.
            </p>
            <p>
              Do not confuse Ailerix with Ailixr, Alierix, Ailix, or Aileron —
              those are other marks. No USPTO hit was found for the exact word
              AILERIX.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
