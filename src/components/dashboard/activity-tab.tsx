"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { AnalyticsSummary } from "@/lib/analytics/types";
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { sampleUsage, formatMetricValue } from "@/lib/mock-usage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function ActivityTab() {
  const [days, setDays] = useState<7 | 30>(7);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async (windowDays: 7 | 30) => {
    setLoading(true);
    setFetchFailed(false);
    try {
      const res = await fetch(`/api/v1/analytics/summary?days=${windowDays}`);
      if (!res.ok) {
        throw new Error("summary unavailable");
      }
      setSummary((await res.json()) as AnalyticsSummary);
    } catch {
      setFetchFailed(true);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary(days);
  }, [days, loadSummary]);

  const usingSample =
    fetchFailed || !summary || summary.totals.requests === 0;

  const totals = usingSample
    ? sampleUsage.totals
    : {
        spend: summary!.totals.spendUsd,
        tokens:
          summary!.totals.promptTokens + summary!.totals.completionTokens,
        requests: summary!.totals.requests,
      };

  const periodLabel = days === 30 ? "Last 30 days" : "Last 7 days";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium">Activity</h2>
          <p className="text-sm text-muted-foreground">
            Routed request volume and spend for your account.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {usingSample ? (
            <Badge variant="secondary" className="font-normal">
              Sample data — no traffic recorded yet
            </Badge>
          ) : null}
          <Select
            value={days === 30 ? "30d" : "7d"}
            onValueChange={(v) => {
              setDays(v === "30d" ? 30 : 7);
            }}
          >
            <SelectTrigger className="h-8 w-[140px]" size="sm">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(
          [
            { key: "requests" as const, label: "Requests" },
            { key: "spend" as const, label: "Spend" },
            { key: "tokens" as const, label: "Tokens" },
          ] as const
        ).map((stat) => (
          <Card key={stat.key} size="sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {stat.label} · {periodLabel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !summary && !fetchFailed ? (
                <p className="text-sm text-muted-foreground">…</p>
              ) : (
                <p className="text-2xl font-semibold tracking-tight">
                  {formatMetricValue(stat.key, totals[stat.key])}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <ActivityHeatmap />
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Per-request family, model decisions, and latency live in request logs.
          </p>
          <Link
            href="/dashboard?tab=logs"
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline",
            )}
          >
            Open Logs
            <ExternalLink className="size-3.5" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
