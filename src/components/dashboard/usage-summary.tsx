"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  MOCK_USAGE_SUMMARY,
  TASK_FAMILY_KEYS,
  TASK_FAMILY_LABELS,
  type TaskFamilyKey,
  type UsageMetric,
  dailyMetricValue,
  formatMetricValue,
} from "@/lib/mock-usage";
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

export function UsageSummary() {
  const [metric, setMetric] = useState<UsageMetric>("spend");

  const chartData = useMemo(
    () =>
      MOCK_USAGE_SUMMARY.daily.map((row) => {
        const entry: Record<string, string | number> = {
          label: row.label,
        };
        for (const key of TASK_FAMILY_KEYS) {
          entry[key] = dailyMetricValue(row, key, metric);
        }
        return entry;
      }),
    [metric],
  );

  const total = MOCK_USAGE_SUMMARY.totals[metric];
  const comparison = MOCK_USAGE_SUMMARY.priorComparison[metric];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 space-y-0 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">
              Usage summary
            </CardTitle>
            <Link
              href="/dashboard?tab=activity"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              View full activity
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
          <Select defaultValue="7d">
            <SelectTrigger className="h-8 w-[140px]" size="sm">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d" disabled>Last 30 days</SelectItem>
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
              {MOCK_USAGE_SUMMARY.topFamilies.map((item, index) => (
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
