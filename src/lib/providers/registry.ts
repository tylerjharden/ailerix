import { anthropicAdapter } from "@/lib/providers/anthropic";
import { echoAdapter } from "@/lib/providers/echo";
import { googleAdapter } from "@/lib/providers/google";
import { openAiCompatAdapter } from "@/lib/providers/openai-compat";
import type { ProviderAdapter } from "@/lib/providers/types";

export type ProviderBinding = {
  adapter: ProviderAdapter;
  apiKeyEnv: string | null;
};

type PrefixRule = {
  prefix: string;
  binding: () => ProviderBinding;
};

const openAi = (baseUrl: string, apiKeyEnv: string): ProviderBinding => ({
  adapter: openAiCompatAdapter({ baseUrl, apiKeyEnv }),
  apiKeyEnv,
});

const RULES: PrefixRule[] = [
  {
    prefix: "openai/",
    binding: () => openAi("https://api.openai.com/v1", "OPENAI_API_KEY"),
  },
  {
    prefix: "deepseek/",
    binding: () => openAi("https://api.deepseek.com/v1", "DEEPSEEK_API_KEY"),
  },
  {
    prefix: "x-ai/",
    binding: () => openAi("https://api.x.ai/v1", "XAI_API_KEY"),
  },
  {
    prefix: "qwen/",
    binding: () =>
      openAi(
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "DASHSCOPE_API_KEY",
      ),
  },
  {
    prefix: "anthropic/",
    binding: () => ({
      adapter: anthropicAdapter({ apiKeyEnv: "ANTHROPIC_API_KEY" }),
      apiKeyEnv: "ANTHROPIC_API_KEY",
    }),
  },
  {
    prefix: "google/",
    binding: () => ({
      adapter: googleAdapter({
        apiKeyEnv: "GOOGLE_API_KEY",
        fallbackApiKeyEnv: "GEMINI_API_KEY",
      }),
      apiKeyEnv: "GOOGLE_API_KEY",
    }),
  },
  {
    prefix: "ailerix/",
    binding: () => ({
      adapter: echoAdapter,
      apiKeyEnv: null,
    }),
  },
];

export function bindingFor(providerSlug: string): ProviderBinding | null {
  for (const rule of RULES) {
    if (providerSlug.startsWith(rule.prefix)) {
      return rule.binding();
    }
  }
  return null;
}

export function isExecutable(providerSlug: string): boolean {
  const binding = bindingFor(providerSlug);
  if (!binding) return false;
  if (binding.apiKeyEnv === null) return true;
  if (providerSlug.startsWith("google/")) {
    const google = process.env.GOOGLE_API_KEY?.trim();
    const gemini = process.env.GEMINI_API_KEY?.trim();
    return Boolean(google || gemini);
  }
  const key = process.env[binding.apiKeyEnv];
  return typeof key === "string" && key.trim() !== "";
}
