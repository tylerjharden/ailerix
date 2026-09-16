import type { TaskFamily } from "@/lib/families";

export type { TaskFamily };

export type AaModelSnapshot = {
  aa_id: string;
  name: string;
  creator: string;
  openrouter_api_id: string | null;
  provider_slug: string;
  intelligence_index: number;
  family_scores: Partial<Record<TaskFamily, number>>;
  cost_per_task_usd: Partial<Record<TaskFamily, number>> & {
    intelligence: number;
  };
  input_per_mtok_usd: number;
  output_per_mtok_usd: number;
  output_tokens_per_sec: number | null;
  ttft_ms: number | null;
  context_window: number;
  capabilities: {
    vision: boolean;
    tools: boolean;
    code: boolean;
    reasoning: boolean;
  };
  synthetic?: boolean;
  retrieved_at: string;
};

export type AaFrontierPoint = {
  aa_id: string;
  family: TaskFamily;
  quality: number;
  cost_per_task_usd: number;
  gradient: number;
};

export type AaSnapshot = {
  version: string;
  generated_at: string;
  license: "commercial" | "missing";
  models: AaModelSnapshot[];
};
