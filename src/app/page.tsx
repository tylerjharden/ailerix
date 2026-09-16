import Link from "next/link";
import { ArrowRight, Gauge, GitBranch, ShieldCheck } from "lucide-react";
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
    title: "Send state, not a model id",
    body: "A ticket, a prompt, or program state. You do not pick Claude or GPT first.",
  },
  {
    title: "Jev answers typed questions",
    body: "Choice, Score, and Noul in one call. Parallel decisions, calibrated probabilities, no generated prose.",
  },
  {
    title: "Ailerix banks the request",
    body: "Software switches on those values, then calls the winning provider. Fallback is already chosen.",
  },
] as const;

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">System One routing</Badge>
          <Badge variant="outline">OpenAI-compatible API</Badge>
        </div>
        <div className="max-w-3xl space-y-5">
          <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
            OpenRouter lists every model. Ailerix decides which one to call.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            Ailerix is a type-safe model router powered by TypeSafe Jev, the
            first System One model. Jev does not chat. It returns a Choice, a
            Score, or a Noul — values your code can branch on in 70–500ms.
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
              <Gauge className="size-4 text-primary" />
              <CardTitle>Decision, not a string</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              OpenRouter still leaves model selection to you or to a chat
              model. Ailerix asks Jev questions whose answers cannot leave the
              schema you defined.
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <ShieldCheck className="size-4 text-primary" />
              <CardTitle>Calibrated confidence</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Act when confidence is high. Escalate when it is not. Thresholds
              live in your repo, not inside a prompt.
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <GitBranch className="size-4 text-primary" />
              <CardTitle>Typed fallbacks</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Every route includes a fallback model, a policy, and the full
              probability distribution Jev returned.
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
