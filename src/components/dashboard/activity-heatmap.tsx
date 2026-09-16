"use client";

import { Info } from "lucide-react";
import { MOCK_ACTIVITY, formatUsd } from "@/lib/mock-usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const INTENSITY_CLASS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-muted",
  1: "bg-primary/15",
  2: "bg-primary/30",
  3: "bg-primary/50",
  4: "bg-primary/80",
};

const MONTH_LABELS = [
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
];

export function ActivityHeatmap() {
  const { stats, cells } = MOCK_ACTIVITY;
  const weeks = 52;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 pb-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-semibold">Activity</CardTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground"
                aria-label="Activity info"
              >
                <Info className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Mock routed requests over the last year (fixture data).
            </TooltipContent>
          </Tooltip>
        </div>
        <span className="text-sm text-muted-foreground">Spend</span>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Longest streak" value={`${stats.longestStreakDays} days`} />
          <Stat label="Avg / day" value={formatUsd(stats.avgPerDayUsd)} />
          <Stat label="Avg / week" value={formatUsd(stats.avgPerWeekUsd)} />
          <Stat label="Total" value={formatUsd(stats.totalUsd)} />
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[640px]">
            <div className="mb-1 flex justify-between px-6 text-[10px] text-muted-foreground">
              {MONTH_LABELS.map((m, i) => (
                <span key={`${m}-${i}`}>{m}</span>
              ))}
            </div>
            <div className="flex gap-1">
              <div className="flex flex-col justify-between py-0.5 text-[10px] text-muted-foreground">
                <span>M</span>
                <span>W</span>
                <span>F</span>
              </div>
              <div className="flex flex-1 gap-[3px]">
                {Array.from({ length: weeks }, (_, week) => (
                  <div key={week} className="flex flex-1 flex-col gap-[3px]">
                    {cells.slice(week * 7, week * 7 + 7).map((cell) => (
                      <Tooltip key={cell.date}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "aspect-square min-h-[10px] w-full rounded-sm",
                              INTENSITY_CLASS[cell.intensity],
                            )}
                            aria-label={`${cell.date}: intensity ${cell.intensity}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {cell.date} — level {cell.intensity}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Less</span>
              {( [0, 1, 2, 3, 4] as const).map((level) => (
                <div
                  key={level}
                  className={cn("size-3 rounded-sm", INTENSITY_CLASS[level])}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-medium">{value}</p>
    </div>
  );
}
