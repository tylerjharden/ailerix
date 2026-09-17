"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import type { AnalyticsSummary } from "@/lib/analytics/types";
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import {
  sampleUsage,
  TASK_FAMILY_KEYS,
  TASK_FAMILY_LABELS,
  type DailyFamilyRow,
  type TaskFamilyKey,
  type UsageMetric,
  type UsageSummaryData,
  dailyMetricValue,
  formatMetricValue,
} from "@/lib/mock-usage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const CHART_COLORS: Record<TaskFamilyKey, string> = {
  intelligence: "var(--chart-1)",
  coding: "var(--chart-2)",
  agents: "var(--chart-3)",
  vision: "var(--chart-4)",
  factual: "var(--chart-5)",
  long_context: "var(--chart-2)",
  professional: "var(--chart-3)",
};

const chartConfig: ChartConfig = TASK_FAMILY_KEYS.reduce((acc, key) => {
  acc[key] = {
    label: TASK_FAMILY_LABELS[key],
    color: CHART_COLORS[key],
  };
  return acc;
}, {} as ChartConfig);

const SAMPLE_BADGE_LABEL = "Sample data — no traffic recorded yet";

function formatShortDateFromIso(day: string): string {
  const d = new Date(`${day}T12:00:00.000Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function emptyFamilies(): Record<TaskFamilyKey, number> {
  return TASK_FAMILY_KEYS.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<TaskFamilyKey, number>,
  );
}

function analyticsToUsageData(
  summary: AnalyticsSummary,
  periodLabel: string,
): UsageSummaryData {
  const daily: DailyFamilyRow[] = summary.byDay.map((row) => {
    const families = emptyFamilies();
    let familyRequestTotal = 0;
    for (const key of TASK_FAMILY_KEYS) {
      familyRequestTotal += row.families[key] ?? 0;
    }
    for (const key of TASK_FAMILY_KEYS) {
      const count = row.families[key] ?? 0;
      if (familyRequestTotal > 0) {
        families[key] = (row.spendUsd * count) / familyRequestTotal;
      } else {
        families[key] = 0;
      }
    }
    return {
      date: row.day,
      label: formatShortDateFromIso(row.day),
      families,
    };
  });

  const topFamilies = [...summary.byFamily]
    .sort((a, b) => b.spendUsd - a.spendUsd)
    .map((row) => ({
      family: row.family as TaskFamilyKey,
      label: (TASK_FAMILY_KEYS as readonly string[]).includes(row.family)
        ? TASK_FAMILY_LABELS[row.family as TaskFamilyKey]
        : row.family,
      amountUsd: row.spendUsd,
    }));

  return {
    periodLabel,
    totals: {
      spend: summary.totals.spendUsd,
      tokens:
        summary.totals.promptTokens + summary.totals.completionTokens,
      requests: summary.totals.requests,
    },
    priorComparison: {
      spend: `Live · ${summary.source === "db" ? "database" : "memory"}`,
      tokens: `Live · ${summary.totals.promptTokens.toLocaleString()} prompt`,
      requests: `Live · ${summary.totals.requests.toLocaleString()} routed`,
    },
    daily,
    topFamilies,
  };
}

function SampleDataBadge({ className }: { className?: string }) {
  return (
    <Badge variant="secondary" className={cn("font-normal", className)}>
      {SAMPLE_BADGE_LABEL}
    </Badge>
  );
}

type UsageSummaryProps = {
  data: UsageSummaryData;
  usingSample: boolean;
  days: 7 | 30;
  onDaysChange: (days: 7 | 30) => void;
  liveSummary?: AnalyticsSummary | null;
};

export function UsageSummary({
  data,
  usingSample,
  days,
  onDaysChange,
  liveSummary,
}: UsageSummaryProps) {
  const [metric, setMetric] = useState<UsageMetric>("spend");

  const chartData = useMemo(() => {
    if (!usingSample && liveSummary) {
      return liveSummary.byDay.map((row) => {
        const entry: Record<string, string | number> = {
          label: formatShortDateFromIso(row.day),
        };
        const familyTotal = TASK_FAMILY_KEYS.reduce(
          (sum, key) => sum + (row.families[key] ?? 0),
          0,
        );
        for (const key of TASK_FAMILY_KEYS) {
          const count = row.families[key] ?? 0;
          switch (metric) {
            case "requests":
              entry[key] = count;
              break;
            case "spend":
              entry[key] =
                familyTotal > 0 ? (row.spendUsd * count) / familyTotal : 0;
              break;
            case "tokens":
              entry[key] =
                familyTotal > 0
                  ? Math.round((row.tokens * count) / familyTotal)
                  : 0;
              break;
            default: {
              const _exhaustive: never = metric;
              throw new Error(`Unknown metric: ${_exhaustive}`);
            }
          }
        }
        return entry;
      });
    }
    return data.daily.map((row) => {
      const entry: Record<string, string | number> = {
        label: row.label,
      };
      for (const key of TASK_FAMILY_KEYS) {
        entry[key] = dailyMetricValue(row, key, metric);
      }
      return entry;
    });
  }, [data.daily, liveSummary, metric, usingSample]);

  const total = data.totals[metric];
  const comparison = data.priorComparison[metric];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 space-y-0 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-semibold">
                Usage summary
              </CardTitle>
              {usingSample ? <SampleDataBadge /> : null}
            </div>
            <Link
              href="/dashboard?tab=activity"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              View full activity
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
          <Select
            value={days === 30 ? "30d" : "7d"}
            onValueChange={(v) => {
              onDaysChange(v === "30d" ? 30 : 7);
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
        <Tabs
          value={metric}
          onValueChange={(v) => {
            if (v === "tokens" || v === "spend" || v === "requests") {
              setMetric(v);
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="spend">Spend</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col justify-center gap-1">
            <p className="text-3xl font-semibold tracking-tight">
              {formatMetricValue(metric, total)}
            </p>
            <p className="text-sm text-muted-foreground">{comparison}</p>
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Daily by family
            </p>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={chartData} margin={{ left: 0, right: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {TASK_FAMILY_KEYS.map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="families"
                    fill={CHART_COLORS[key]}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          </div>
          <div className="min-w-0 border-t border-border/60 pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              Top families by spend
            </p>
            <ul className="space-y-2">
              {data.topFamilies.map((item, index) => (
                <li
                  key={item.family}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span
                    className={cn(
                      "truncate",
                      index === 0 && "font-medium text-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatMetricValue("spend", item.amountUsd)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
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

  const usingSampleOverview =
    fetchFailed || !summary || summary.totals.requests === 0;

  const usageData = usingSampleOverview
    ? sampleUsage
    : analyticsToUsageData(
        summary,
        days === 30 ? "Last 30 days" : "Last 7 days",
      );

  const showHeatmapSampleBadge =
    usingSampleOverview || (summary?.byDay.length ?? 0) < 14;

  if (loading && !summary && !fetchFailed) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Loading usage…
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UsageSummary
        data={usageData}
        usingSample={usingSampleOverview}
        days={days}
        onDaysChange={setDays}
        liveSummary={usingSampleOverview ? null : summary}
      />
      <div className="space-y-2">
        {showHeatmapSampleBadge ? (
          <SampleDataBadge className="w-fit" />
        ) : null}
        <ActivityHeatmap />
      </div>
    </div>
  );
}
