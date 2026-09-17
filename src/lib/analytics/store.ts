import { randomUUID } from "node:crypto";

import { dbAvailable, getPrismaClient } from "@/lib/analytics/db";
import type {
  AnalyticsSummary,
  RouteEventInput,
  StoredRouteEvent,
} from "@/lib/analytics/types";

const RING_BUFFER_CAP = 500;

const memoryRing: StoredRouteEvent[] = [];

function spendUsd(event: Pick<RouteEventInput, "costPerTaskUsd" | "estimatedTurnUsd">): number {
  return event.estimatedTurnUsd ?? event.costPerTaskUsd;
}

function tokensFor(event: Pick<RouteEventInput, "promptTokens" | "completionTokens">): number {
  return (event.promptTokens ?? 0) + (event.completionTokens ?? 0);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index] ?? 0;
}

function appendToMemory(input: RouteEventInput): void {
  const now = new Date();
  const stored: StoredRouteEvent = {
    ...input,
    revealed: input.revealed ?? false,
    id: `mem_${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };
  memoryRing.push(stored);
  while (memoryRing.length > RING_BUFFER_CAP) {
    memoryRing.shift();
  }
}

function findInMemory(generationId: string): StoredRouteEvent | null {
  for (let i = memoryRing.length - 1; i >= 0; i -= 1) {
    const row = memoryRing[i];
    if (row && row.generationId === generationId) {
      return row;
    }
  }
  return null;
}

function listFromMemory(limit: number): StoredRouteEvent[] {
  return [...memoryRing].reverse().slice(0, limit);
}

function mapPrismaRow(row: {
  id: string;
  generationId: string;
  endpoint: string;
  policy: string;
  engine: string;
  family: string;
  familyConfidence: number;
  qualityFloor: number;
  mappedFloor: number;
  aaId: string;
  providerSlug: string;
  fallbackAaId: string;
  nextUpUsed: boolean;
  degraded: boolean;
  executed: boolean;
  revealed: boolean;
  status: string;
  errorCode: string | null;
  jevMs: number;
  walkMs: number;
  providerTtftMs: number | null;
  providerTotalMs: number | null;
  totalMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  costPerTaskUsd: number;
  estimatedTurnUsd: number | null;
  createdAt: Date;
  updatedAt: Date;
}): StoredRouteEvent {
  return {
    id: row.id,
    generationId: row.generationId,
    endpoint: row.endpoint,
    policy: row.policy,
    engine: row.engine,
    family: row.family,
    familyConfidence: row.familyConfidence,
    qualityFloor: row.qualityFloor,
    mappedFloor: row.mappedFloor,
    aaId: row.aaId,
    providerSlug: row.providerSlug,
    fallbackAaId: row.fallbackAaId,
    nextUpUsed: row.nextUpUsed,
    degraded: row.degraded,
    executed: row.executed,
    revealed: row.revealed,
    status: row.status,
    errorCode: row.errorCode,
    jevMs: row.jevMs,
    walkMs: row.walkMs,
    providerTtftMs: row.providerTtftMs,
    providerTotalMs: row.providerTotalMs,
    totalMs: row.totalMs,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    reasoningTokens: row.reasoningTokens,
    costPerTaskUsd: row.costPerTaskUsd,
    estimatedTurnUsd: row.estimatedTurnUsd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildSummary(events: StoredRouteEvent[], source: "db" | "memory"): AnalyticsSummary {
  if (events.length === 0) {
    return {
      source,
      totals: { requests: 0, spendUsd: 0, promptTokens: 0, completionTokens: 0 },
      byDay: [],
      byFamily: [],
      rates: { nextUp: 0, degraded: 0, providerError: 0, executed: 0 },
      latency: {
        jevMsP50: 0,
        walkMsP50: 0,
        providerTotalMsP50: 0,
        totalMsP50: 0,
        totalMsP95: 0,
      },
    };
  }

  const requests = events.length;
  let spendTotal = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let nextUpCount = 0;
  let degradedCount = 0;
  let providerErrorCount = 0;
  let executedCount = 0;

  const jevMs: number[] = [];
  const walkMs: number[] = [];
  const providerTotalMs: number[] = [];
  const totalMs: number[] = [];

  const byDayMap = new Map<
    string,
    { requests: number; spendUsd: number; tokens: number; families: Record<string, number> }
  >();
  const byFamilyMap = new Map<
    string,
    { requests: number; spendUsd: number; totalMsSum: number }
  >();

  for (const event of events) {
    spendTotal += spendUsd(event);
    promptTokens += event.promptTokens ?? 0;
    completionTokens += event.completionTokens ?? 0;
    if (event.nextUpUsed) nextUpCount += 1;
    if (event.degraded) degradedCount += 1;
    if (event.status === "provider_error") providerErrorCount += 1;
    if (event.executed) executedCount += 1;

    jevMs.push(event.jevMs);
    walkMs.push(event.walkMs);
    if (event.providerTotalMs != null) {
      providerTotalMs.push(event.providerTotalMs);
    }
    totalMs.push(event.totalMs);

    const day = dayKey(event.createdAt);
    let dayRow = byDayMap.get(day);
    if (!dayRow) {
      dayRow = { requests: 0, spendUsd: 0, tokens: 0, families: {} };
      byDayMap.set(day, dayRow);
    }
    dayRow.requests += 1;
    dayRow.spendUsd += spendUsd(event);
    dayRow.tokens += tokensFor(event);
    dayRow.families[event.family] = (dayRow.families[event.family] ?? 0) + 1;

    let familyRow = byFamilyMap.get(event.family);
    if (!familyRow) {
      familyRow = { requests: 0, spendUsd: 0, totalMsSum: 0 };
      byFamilyMap.set(event.family, familyRow);
    }
    familyRow.requests += 1;
    familyRow.spendUsd += spendUsd(event);
    familyRow.totalMsSum += event.totalMs;
  }

  const byDay = [...byDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, row]) => ({
      day,
      requests: row.requests,
      spendUsd: row.spendUsd,
      tokens: row.tokens,
      families: row.families,
    }));

  const byFamily = [...byFamilyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, row]) => ({
      family,
      requests: row.requests,
      spendUsd: row.spendUsd,
      avgTotalMs: row.requests > 0 ? row.totalMsSum / row.requests : 0,
    }));

  return {
    source,
    totals: { requests, spendUsd: spendTotal, promptTokens, completionTokens },
    byDay,
    byFamily,
    rates: {
      nextUp: nextUpCount / requests,
      degraded: degradedCount / requests,
      providerError: providerErrorCount / requests,
      executed: executedCount / requests,
    },
    latency: {
      jevMsP50: percentile(jevMs, 50),
      walkMsP50: percentile(walkMs, 50),
      providerTotalMsP50: percentile(providerTotalMs, 50),
      totalMsP50: percentile(totalMs, 50),
      totalMsP95: percentile(totalMs, 95),
    },
  };
}

function inputToCreateData(input: RouteEventInput) {
  return {
    generationId: input.generationId,
    endpoint: input.endpoint,
    policy: input.policy,
    engine: input.engine,
    family: input.family,
    familyConfidence: input.familyConfidence,
    qualityFloor: input.qualityFloor,
    mappedFloor: input.mappedFloor,
    aaId: input.aaId,
    providerSlug: input.providerSlug,
    fallbackAaId: input.fallbackAaId,
    nextUpUsed: input.nextUpUsed,
    degraded: input.degraded,
    executed: input.executed,
    revealed: input.revealed ?? false,
    status: input.status,
    errorCode: input.errorCode ?? null,
    jevMs: input.jevMs,
    walkMs: input.walkMs,
    providerTtftMs: input.providerTtftMs ?? null,
    providerTotalMs: input.providerTotalMs ?? null,
    totalMs: input.totalMs,
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    reasoningTokens: input.reasoningTokens ?? null,
    costPerTaskUsd: input.costPerTaskUsd,
    estimatedTurnUsd: input.estimatedTurnUsd ?? null,
  };
}

export async function recordEvent(input: RouteEventInput): Promise<void> {
  try {
    appendToMemory(input);
    if (dbAvailable()) {
      try {
        const prisma = getPrismaClient();
        await prisma.routeEvent.create({ data: inputToCreateData(input) });
      } catch (err) {
        console.warn("[analytics] failed to persist route event:", err);
      }
    }
  } catch (err) {
    console.warn("[analytics] recordEvent failed:", err);
  }
}

export async function getEvent(
  generationId: string,
): Promise<StoredRouteEvent | null> {
  if (dbAvailable()) {
    try {
      const prisma = getPrismaClient();
      const row = await prisma.routeEvent.findUnique({ where: { generationId } });
      if (row) {
        return mapPrismaRow(row);
      }
    } catch {
      // fall through to memory
    }
  }
  return findInMemory(generationId);
}

export async function listEvents(options?: {
  limit?: number;
}): Promise<StoredRouteEvent[]> {
  const limit = options?.limit ?? 50;
  if (dbAvailable()) {
    try {
      const prisma = getPrismaClient();
      const rows = await prisma.routeEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map(mapPrismaRow);
    } catch {
      // fall through to memory
    }
  }
  return listFromMemory(limit);
}

export async function summarize(options?: { days?: number }): Promise<AnalyticsSummary> {
  const days = options?.days ?? 7;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  if (dbAvailable()) {
    try {
      const prisma = getPrismaClient();
      const rows = await prisma.routeEvent.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      });
      return buildSummary(rows.map(mapPrismaRow), "db");
    } catch {
      // fall through to memory
    }
  }

  const filtered = memoryRing.filter((e) => e.createdAt >= since);
  return buildSummary(filtered, "memory");
}
