export type UsageMetric = "tokens" | "spend" | "requests";

export type TaskFamilyKey =
  | "intelligence"
  | "coding"
  | "agents"
  | "vision"
  | "factual"
  | "long_context"
  | "professional";

export const TASK_FAMILY_KEYS: TaskFamilyKey[] = [
  "intelligence",
  "coding",
  "agents",
  "vision",
  "factual",
  "long_context",
  "professional",
];

export const TASK_FAMILY_LABELS: Record<TaskFamilyKey, string> = {
  intelligence: "Intelligence",
  coding: "Coding",
  agents: "Agents",
  vision: "Vision",
  factual: "Factual",
  long_context: "Long context",
  professional: "Professional",
};

/** Deterministic 32-bit LCG — same output on server and client. */
function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const rand = createSeededRandom(0xa11e_7e4);

/** Reference date for deterministic "last 7 days" labels (fixed, not wall-clock). */
export const USAGE_PERIOD_END = new Date("2026-09-16T12:00:00.000Z");

export type DailyFamilyRow = {
  date: string;
  label: string;
  families: Record<TaskFamilyKey, number>;
};

export type TopFamilySpend = {
  family: TaskFamilyKey;
  label: string;
  amountUsd: number;
};

export type UsageSummaryData = {
  periodLabel: string;
  totals: Record<UsageMetric, number>;
  priorComparison: Record<UsageMetric, string>;
  daily: DailyFamilyRow[];
  topFamilies: TopFamilySpend[];
};

export type ActivityStats = {
  longestStreakDays: number;
  avgPerDayUsd: number;
  avgPerWeekUsd: number;
  totalUsd: number;
};

export type HeatmapCell = {
  date: string;
  intensity: 0 | 1 | 2 | 3 | 4;
};

export type ActivityData = {
  stats: ActivityStats;
  cells: HeatmapCell[];
};

function formatShortDate(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildDailyRows(): DailyFamilyRow[] {
  const rows: DailyFamilyRow[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(USAGE_PERIOD_END);
    d.setUTCDate(d.getUTCDate() - offset);
    const families = {} as Record<TaskFamilyKey, number>;
    for (const key of TASK_FAMILY_KEYS) {
      const base = rand() * 0.08 + 0.01;
      const familyBoost =
        key === "coding" ? 1.4 : key === "intelligence" ? 1.2 : 1;
      families[key] = Math.round(base * familyBoost * 1000) / 1000;
    }
    rows.push({
      date: isoDate(d),
      label: formatShortDate(d),
      families,
    });
  }
  return rows;
}

function sumFamilies(
  rows: DailyFamilyRow[],
  metric: UsageMetric,
): Record<TaskFamilyKey, number> {
  const totals = {} as Record<TaskFamilyKey, number>;
  for (const key of TASK_FAMILY_KEYS) {
    totals[key] = 0;
  }
  for (const row of rows) {
    for (const key of TASK_FAMILY_KEYS) {
      const spend = row.families[key];
      if (metric === "spend") {
        totals[key] += spend;
      } else if (metric === "tokens") {
        totals[key] += Math.round(spend * 42000);
      } else {
        totals[key] += Math.max(1, Math.round(spend * 180));
      }
    }
  }
  return totals;
}

function buildTopFamilies(rows: DailyFamilyRow[]): TopFamilySpend[] {
  const totals = sumFamilies(rows, "spend");
  return TASK_FAMILY_KEYS
    .map((family) => ({
      family,
      label: TASK_FAMILY_LABELS[family],
      amountUsd: totals[family],
    }))
    .sort((a, b) => b.amountUsd - a.amountUsd);
}

const dailyRows = buildDailyRows();

const spendTotal = dailyRows.reduce(
  (acc, row) =>
    acc + TASK_FAMILY_KEYS.reduce((s, k) => s + row.families[k], 0),
  0,
);

const tokensTotal = Math.round(spendTotal * 42000);
const requestsTotal = Math.max(
  1,
  dailyRows.reduce(
    (acc, row) =>
      acc +
      TASK_FAMILY_KEYS.reduce(
        (s, k) => s + Math.max(1, Math.round(row.families[k] * 180)),
        0,
      ),
    0,
  ),
);

/** Labeled sample fallback when no route events are recorded yet. */
export const sampleUsage: UsageSummaryData = {
  periodLabel: "Last 7 days",
  totals: {
    spend: Math.round(spendTotal * 100) / 100,
    tokens: tokensTotal,
    requests: requestsTotal,
  },
  priorComparison: {
    spend: "12% vs prior period",
    tokens: "8% vs prior period",
    requests: "5% vs prior period",
  },
  daily: dailyRows,
  topFamilies: buildTopFamilies(dailyRows),
};

function buildHeatmap(): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  const end = new Date(USAGE_PERIOD_END);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 52 * 7 + 1);

  let dayIndex = 0;
  for (let w = 0; w < 52; w++) {
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + dayIndex);
      if (d > end) {
        cells.push({ date: isoDate(d), intensity: 0 });
      } else {
        const r = rand();
        let intensity: 0 | 1 | 2 | 3 | 4 = 0;
        if (r > 0.92) intensity = 4;
        else if (r > 0.82) intensity = 3;
        else if (r > 0.68) intensity = 2;
        else if (r > 0.45) intensity = 1;
        cells.push({ date: isoDate(d), intensity });
      }
      dayIndex++;
    }
  }
  return cells;
}

const heatmapCells = buildHeatmap();

function computeStreak(cells: HeatmapCell[]): number {
  let best = 0;
  let current = 0;
  for (const cell of cells) {
    if (cell.intensity > 0) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

const activeDays = heatmapCells.filter((c) => c.intensity > 0).length;
const totalHeatmapSpend =
  activeDays * 0.018 + heatmapCells.reduce((s, c) => s + c.intensity * 0.004, 0);

export const MOCK_ACTIVITY: ActivityData = {
  stats: {
    longestStreakDays: computeStreak(heatmapCells),
    avgPerDayUsd: Math.round((totalHeatmapSpend / 365) * 100) / 100,
    avgPerWeekUsd: Math.round((totalHeatmapSpend / 52) * 100) / 100,
    totalUsd: Math.round(totalHeatmapSpend * 100) / 100,
  },
  cells: heatmapCells,
};

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMetricValue(metric: UsageMetric, value: number): string {
  switch (metric) {
    case "spend":
      return formatUsd(value);
    case "tokens":
      return new Intl.NumberFormat("en-US", {
        notation: value >= 10000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      }).format(value);
    case "requests":
      return new Intl.NumberFormat("en-US").format(value);
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unknown metric: ${_exhaustive}`);
    }
  }
}

export function dailyMetricValue(
  row: DailyFamilyRow,
  family: TaskFamilyKey,
  metric: UsageMetric,
): number {
  const spend = row.families[family];
  switch (metric) {
    case "spend":
      return spend;
    case "tokens":
      return Math.round(spend * 42000);
    case "requests":
      return Math.max(1, Math.round(spend * 180));
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unknown metric: ${_exhaustive}`);
    }
  }
}
