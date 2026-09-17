export type RouteEventInput = {
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
  revealed?: boolean;
  status: string;
  errorCode?: string | null;
  jevMs: number;
  walkMs: number;
  providerTtftMs?: number | null;
  providerTotalMs?: number | null;
  totalMs: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  costPerTaskUsd: number;
  estimatedTurnUsd?: number | null;
  accountId?: string | null;
  apiKeyId?: string | null;
  anonId?: string | null;
};

export type StoredRouteEvent = RouteEventInput & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AnalyticsSummary = {
  source: "db" | "memory";
  totals: {
    requests: number;
    spendUsd: number;
    promptTokens: number;
    completionTokens: number;
  };
  byDay: Array<{
    day: string;
    requests: number;
    spendUsd: number;
    tokens: number;
    families: Record<string, number>;
  }>;
  byFamily: Array<{
    family: string;
    requests: number;
    spendUsd: number;
    avgTotalMs: number;
  }>;
  rates: {
    nextUp: number;
    degraded: number;
    providerError: number;
    executed: number;
  };
  latency: {
    jevMsP50: number;
    walkMsP50: number;
    providerTotalMsP50: number;
    totalMsP50: number;
    totalMsP95: number;
  };
};
