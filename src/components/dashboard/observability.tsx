"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AnalyticsSummary } from "@/lib/analytics/types";
import {
  TASK_FAMILY_KEYS,
  TASK_FAMILY_LABELS,
  type TaskFamilyKey,
} from "@/lib/mock-usage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

function LatencyBar({
  label,
  valueMs,
  maxMs,
}: {
  label: string;
  valueMs: number;
  maxMs: number;
}) {
  const width =
    maxMs > 0 ? Math.min(100, Math.round((valueMs / maxMs) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">
          {Math.round(valueMs).toLocaleString()} ms
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function familyLabel(family: string): string {
  if ((TASK_FAMILY_KEYS as readonly string[]).includes(family)) {
    return TASK_FAMILY_LABELS[family as TaskFamilyKey];
  }
  return family;
}

export function ObservabilityPanel() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/analytics/summary?days=30");
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "Observability metrics are unavailable in this environment."
            : `Failed to load summary (${res.status}).`,
        );
      }
      setSummary((await res.json()) as AnalyticsSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasTraffic = (summary?.totals.requests ?? 0) > 0;
  const maxLatency = summary
    ? Math.max(
        summary.latency.jevMsP50,
        summary.latency.walkMsP50,
        summary.latency.providerTotalMsP50,
        summary.latency.totalMsP50,
        summary.latency.totalMsP95,
        1,
      )
    : 1;

  const maxFamilyRequests = summary
    ? Math.max(...summary.byFamily.map((f) => f.requests), 1)
    : 1;

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load observability data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !hasTraffic ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No requests yet —{" "}
            <Link href="/playground" className="text-foreground underline-offset-4 hover:underline">
              hit the playground
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              Source: {summary?.source === "db" ? "database" : "memory buffer"}
            </Badge>
            <span className="text-xs text-muted-foreground">Last 30 days</span>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle className="text-base font-semibold">
                  Latency breakdown (p50)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <LatencyBar
                  label="Jev classification"
                  valueMs={summary!.latency.jevMsP50}
                  maxMs={maxLatency}
                />
                <LatencyBar
                  label="Frontier walk"
                  valueMs={summary!.latency.walkMsP50}
                  maxMs={maxLatency}
                />
                <LatencyBar
                  label="Provider execution"
                  valueMs={summary!.latency.providerTotalMsP50}
                  maxMs={maxLatency}
                />
                <LatencyBar
                  label="End-to-end (p50)"
                  valueMs={summary!.latency.totalMsP50}
                  maxMs={maxLatency}
                />
                <LatencyBar
                  label="End-to-end (p95)"
                  valueMs={summary!.latency.totalMsP95}
                  maxMs={maxLatency}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle className="text-base font-semibold">
                  Decision quality
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <RateRow label="Next-up used" value={summary!.rates.nextUp} />
                <RateRow label="Degraded route" value={summary!.rates.degraded} />
                <RateRow label="Executed" value={summary!.rates.executed} />
                <RateRow
                  label="Provider errors"
                  value={summary!.rates.providerError}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle className="text-base font-semibold">
                Requests by family
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              {summary!.byFamily.length === 0 ? (
                <p className="text-sm text-muted-foreground">No family breakdown yet.</p>
              ) : (
                summary!.byFamily.map((row) => (
                  <div key={row.family} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{familyLabel(row.family)}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {row.requests.toLocaleString()} req
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full bg-chart-2")}
                        style={{
                          width: `${Math.round((row.requests / maxFamilyRequests) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RateRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{formatPercent(value)}</span>
    </div>
  );
}
