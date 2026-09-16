import type { CatalogModel, RoutingPolicy } from "@/lib/models";
import type { TaskFamily } from "@/lib/families";
import type { DecisionEngine, SystemOneResponse, SystemOneState } from "@/lib/system-one";

export type RouteDecision = {
  model: CatalogModel;
  fallback: CatalogModel;
  policy: RoutingPolicy;
  engine: DecisionEngine;
  latency_ms: number;
  reasons: string[];
  decisions: SystemOneResponse;
  family?: TaskFamily;
  aa_id?: string;
  cost_per_task_usd?: number;
  next_up_used?: boolean;
};

export async function routeRequest(_input: {
  state: SystemOneState;
  policy: RoutingPolicy;
}): Promise<RouteDecision> {
  // WP-4 wires this to the Artificial Analysis frontier walker.
  throw new Error("routeRequest is being rewired to the frontier walker (WP-4).");
}
