export const MODEL_CAPABILITIES = [
  "chat",
  "code",
  "vision",
  "tools",
  "long-context",
] as const;

export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export const ROUTING_POLICIES = [
  "cheap",
  "balanced",
  "quality",
  "latency",
] as const;

export type RoutingPolicy = (typeof ROUTING_POLICIES)[number];

export type CatalogModel = {
  id: string;
  name: string;
  provider: string;
  context: number;
  inputPerMTok: number;
  outputPerMTok: number;
  latencyMs: number;
  capabilities: ModelCapability[];
  quality: 1 | 2 | 3 | 4 | 5;
  summary: string;
};

export const CATALOG: CatalogModel[] = [
  {
    id: "openai/gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    provider: "OpenAI",
    context: 1_000_000,
    inputPerMTok: 5,
    outputPerMTok: 25,
    latencyMs: 4200,
    capabilities: ["chat", "code", "vision", "tools", "long-context"],
    quality: 5,
    summary: "Frontier reasoning for hard, multi-step work.",
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "OpenAI",
    context: 256_000,
    inputPerMTok: 0.25,
    outputPerMTok: 2,
    latencyMs: 900,
    capabilities: ["chat", "code", "tools"],
    quality: 3,
    summary: "Cheap default for everyday chat and light tools.",
  },
  {
    id: "anthropic/claude-fable-5.1",
    name: "Claude Fable 5.1",
    provider: "Anthropic",
    context: 200_000,
    inputPerMTok: 5,
    outputPerMTok: 25,
    latencyMs: 3800,
    capabilities: ["chat", "code", "vision", "tools", "long-context"],
    quality: 5,
    summary: "Strongest writing, code review, and long-document work.",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    context: 200_000,
    inputPerMTok: 0.8,
    outputPerMTok: 4,
    latencyMs: 650,
    capabilities: ["chat", "code", "tools"],
    quality: 3,
    summary: "Fast Anthropic model for classification and drafts.",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    context: 1_000_000,
    inputPerMTok: 1.25,
    outputPerMTok: 10,
    latencyMs: 2100,
    capabilities: ["chat", "code", "vision", "tools", "long-context"],
    quality: 4,
    summary: "Long-context multimodal work at mid-tier price.",
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    context: 1_000_000,
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    latencyMs: 480,
    capabilities: ["chat", "vision", "tools", "long-context"],
    quality: 3,
    summary: "Lowest-latency multimodal route.",
  },
  {
    id: "deepseek/deepseek-v4",
    name: "DeepSeek V4",
    provider: "DeepSeek",
    context: 128_000,
    inputPerMTok: 0.28,
    outputPerMTok: 0.42,
    latencyMs: 1600,
    capabilities: ["chat", "code", "tools"],
    quality: 4,
    summary: "High code quality per dollar.",
  },
  {
    id: "qwen/qwen3-coder",
    name: "Qwen3 Coder",
    provider: "Qwen",
    context: 256_000,
    inputPerMTok: 0.2,
    outputPerMTok: 0.8,
    latencyMs: 1400,
    capabilities: ["chat", "code", "tools"],
    quality: 4,
    summary: "Specialist route for repositories and diffs.",
  },
  {
    id: "meta-llama/llama-4-70b",
    name: "Llama 4 70B",
    provider: "Meta",
    context: 128_000,
    inputPerMTok: 0.18,
    outputPerMTok: 0.18,
    latencyMs: 1100,
    capabilities: ["chat", "code", "tools"],
    quality: 3,
    summary: "Open-weight workhorse for private or high-volume traffic.",
  },
  {
    id: "mistral/mistral-large-3",
    name: "Mistral Large 3",
    provider: "Mistral",
    context: 128_000,
    inputPerMTok: 2,
    outputPerMTok: 6,
    latencyMs: 1700,
    capabilities: ["chat", "code", "tools"],
    quality: 4,
    summary: "EU-hosted frontier alternative.",
  },
  {
    id: "x-ai/grok-4",
    name: "Grok 4",
    provider: "xAI",
    context: 256_000,
    inputPerMTok: 3,
    outputPerMTok: 15,
    latencyMs: 1900,
    capabilities: ["chat", "code", "tools"],
    quality: 4,
    summary: "Current-events and tool-using agents.",
  },
  {
    id: "ailerix/echo-local",
    name: "Echo Local",
    provider: "Ailerix",
    context: 32_000,
    inputPerMTok: 0,
    outputPerMTok: 0,
    latencyMs: 40,
    capabilities: ["chat"],
    quality: 1,
    summary: "Deterministic local fallback. Always available.",
  },
];

export function getModel(id: string): CatalogModel | undefined {
  return CATALOG.find((model) => model.id === id);
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(2)}`;
}

export function isRoutingPolicy(value: string): value is RoutingPolicy {
  return (ROUTING_POLICIES as readonly string[]).includes(value);
}

export function isModelCapability(value: string): value is ModelCapability {
  return (MODEL_CAPABILITIES as readonly string[]).includes(value);
}
