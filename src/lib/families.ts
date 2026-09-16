export const TASK_FAMILIES = [
  "intelligence",
  "coding",
  "agents",
  "vision",
  "factual",
  "long_context",
  "professional",
] as const;

export type TaskFamily = (typeof TASK_FAMILIES)[number];

export function isTaskFamily(value: string): value is TaskFamily {
  return (TASK_FAMILIES as readonly string[]).includes(value);
}

export const FAMILY_DESCRIPTIONS: Record<TaskFamily, string> = {
  intelligence: "Open-ended reasoning, writing, analysis. The default family.",
  coding: "Programming, diffs, repository Q&A, stack traces.",
  agents: "Multi-step tool use, browsing, plan-then-act workflows.",
  vision: "Images, screenshots, or diagrams are load-bearing.",
  factual: "Closed-book facts, citations, low hallucination tolerance.",
  long_context: "Long documents, books, multi-file corpora.",
  professional: "Legal, medical, finance, or regulated tone.",
};
