import { CATALOG, type RoutingPolicy } from "@/lib/models";

export const SYSTEM_ONE_MODELS = ["jev-latest"] as const;
export type SystemOneModel = (typeof SYSTEM_ONE_MODELS)[number];

export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

export type ScoreQuestion = {
  type: "score";
  instructions: string;
  criteria: string[];
};

export type NoulQuestion = {
  type: "noul";
  instructions: string;
};

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type ScoreAnswer = {
  type: "score";
  score: number;
  legend: string[];
  probabilities: number[];
  confidence: number;
};

export type NoulAnswer = {
  type: "noul";
  noul: number;
  confidence: number;
};

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export type SystemOneState = string | Record<string, unknown> | unknown[];

export type SystemOneRequest = {
  state: SystemOneState;
  model?: SystemOneModel;
  questions: Record<string, Question>;
};

export type DecisionEngine = "jev" | "ailerix-local";

export type SystemOneResponse = {
  model: SystemOneModel;
  engine: DecisionEngine;
  latency_ms: number;
  answers: Record<string, Answer>;
};

export function isSystemOneModel(value: string): value is SystemOneModel {
  return (SYSTEM_ONE_MODELS as readonly string[]).includes(value);
}

export function serializeState(state: SystemOneState): string {
  if (typeof state === "string") return state;
  return JSON.stringify(state);
}

function normalize(weights: number[]): number[] {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return weights.map(() => 1 / weights.length);
  }
  return weights.map((value) => value / total);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type PromptSignals = {
  text: string;
  length: number;
  isCode: boolean;
  isVision: boolean;
  isLong: boolean;
  isUrgent: boolean;
  isSimple: boolean;
  mentionsCost: boolean;
  mentionsSpeed: boolean;
};

export function analyzePrompt(state: SystemOneState): PromptSignals {
  const text = serializeState(state);
  const lower = text.toLowerCase();
  const isCode =
    /```|function\s|const\s|import\s|export\s|def\s|class\s|fn\s|typescript|python|rust|golang|stack trace|compiler/.test(
      lower,
    );
  const isVision =
    /image|screenshot|photo|\.png|\.jpg|\.webp|diagram|wireframe|ui mock/.test(
      lower,
    );
  const isLong = text.length > 3500;
  const isUrgent = /asap|urgent|p0|outage|production down|sev-?1/.test(lower);
  const isSimple = text.length < 90 && !isCode && !isVision;
  const mentionsCost = /cheap|cost|budget|price|token/.test(lower);
  const mentionsSpeed = /fast|latency|realtime|real-time|low latency/.test(
    lower,
  );

  return {
    text,
    length: text.length,
    isCode,
    isVision,
    isLong,
    isUrgent,
    isSimple,
    mentionsCost,
    mentionsSpeed,
  };
}

function answerQuestion(question: Question, signals: PromptSignals): Answer {
  switch (question.type) {
    case "choice": {
      const keys = Object.keys(question.criteria);
      if (keys.length === 0) {
        throw new Error("Choice questions need at least one criterion.");
      }

      const weights = keys.map((key) => {
        const haystack = `${key} ${question.criteria[key]}`.toLowerCase();
        let score = 0.35;
        if (signals.isCode && /code|coder|qwen|deepseek/.test(haystack)) {
          score += 1.4;
        }
        if (signals.isVision && /vision|gemini|flash|multimodal/.test(haystack)) {
          score += 1.3;
        }
        if (signals.isLong && /long|terra|fable|gemini/.test(haystack)) {
          score += 0.9;
        }
        if (signals.isSimple && /mini|haiku|flash|echo|cheap/.test(haystack)) {
          score += 1.2;
        }
        if (signals.mentionsCost && /cheap|mini|flash|deepseek|llama|echo/.test(haystack)) {
          score += 1.1;
        }
        if (signals.mentionsSpeed && /flash|haiku|mini|echo|latency/.test(haystack)) {
          score += 1.1;
        }
        if (!signals.isSimple && /terra|fable|quality|frontier/.test(haystack)) {
          score += 0.7;
        }
        return score;
      });

      const probabilities = Object.fromEntries(
        keys.map((key, index) => [key, Number(normalize(weights)[index].toFixed(4))]),
      );
      const choice = keys.reduce((best, key) =>
        probabilities[key] > probabilities[best] ? key : best,
      );
      const confidence = clamp01(0.52 + probabilities[choice] * 0.42);

      return {
        type: "choice",
        choice,
        probabilities,
        confidence: Number(confidence.toFixed(3)),
      };
    }
    case "score": {
      if (question.criteria.length === 0) {
        throw new Error("Score questions need at least one level.");
      }

      const levels = question.criteria.length;
      const raw = question.criteria.map((_, index) => {
        const position = index / Math.max(levels - 1, 1);
        let weight = 0.4;
        if (signals.isSimple) weight += (1 - position) * 1.6;
        else if (signals.isCode || signals.isLong) weight += position * 1.5;
        else weight += (1 - Math.abs(position - 0.45)) * 1.2;
        if (signals.isUrgent) weight += position * 0.4;
        return weight;
      });
      const probabilities = normalize(raw).map((value) => Number(value.toFixed(4)));
      const score = probabilities.reduce(
        (sum, probability, index) => sum + probability * index,
        0,
      );
      const peak = Math.max(...probabilities);

      return {
        type: "score",
        score: Number(score.toFixed(3)),
        legend: question.criteria,
        probabilities,
        confidence: Number(clamp01(0.5 + peak * 0.45).toFixed(3)),
      };
    }
    case "noul": {
      const instructions = question.instructions.toLowerCase();
      let noul = 0.18;
      if (/vision|image|screenshot/.test(instructions)) {
        noul = signals.isVision ? 0.93 : 0.08;
      } else if (/tool|function call|agent/.test(instructions)) {
        noul = signals.isCode || /api|tool|browser/.test(signals.text.toLowerCase())
          ? 0.78
          : 0.22;
      } else if (/code|programming/.test(instructions)) {
        noul = signals.isCode ? 0.91 : 0.12;
      } else if (/urgent|time-sensitiv/.test(instructions)) {
        noul = signals.isUrgent ? 0.94 : 0.16;
      } else if (/long|document|context/.test(instructions)) {
        noul = signals.isLong ? 0.88 : 0.14;
      }
      return {
        type: "noul",
        noul: Number(noul.toFixed(3)),
        confidence: Number(clamp01(0.58 + Math.abs(noul - 0.5) * 0.7).toFixed(3)),
      };
    }
    default: {
      const _exhaustive: never = question;
      throw new Error(`Unhandled question type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function evaluateLocal(
  request: SystemOneRequest,
): Omit<SystemOneResponse, "latency_ms"> {
  const signals = analyzePrompt(request.state);
  const answers = Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => [
      id,
      answerQuestion(question, signals),
    ]),
  );

  return {
    model: request.model ?? "jev-latest",
    engine: "ailerix-local",
    answers,
  };
}

export async function evaluateSystemOne(
  request: SystemOneRequest,
): Promise<SystemOneResponse> {
  const started = Date.now();
  const apiKey = process.env.TYPESAFE_API_KEY;

  if (apiKey) {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: request.state,
        model: request.model ?? "jev-latest",
        questions: request.questions,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`TypeSafe Jev returned ${response.status}: ${detail}`);
    }

    const payload = (await response.json()) as {
      answers: Record<string, Answer>;
      model?: SystemOneModel;
    };

    return {
      model: payload.model ?? "jev-latest",
      engine: "jev",
      latency_ms: Date.now() - started,
      answers: payload.answers,
    };
  }

  const local = evaluateLocal(request);
  return {
    ...local,
    latency_ms: Math.max(70, Date.now() - started + 80),
  };
}

export function routingQuestions(
  policy: RoutingPolicy,
): Record<string, Question> {
  const criteria = Object.fromEntries(
    CATALOG.map((model) => [
      model.id,
      `${model.name} (${model.provider}). ${model.summary} $${model.inputPerMTok}/M in, ~${model.latencyMs}ms.`,
    ]),
  );

  return {
    model: {
      type: "choice",
      instructions: `Select the single best model for this request under a ${policy} routing policy.`,
      criteria,
    },
    needs_vision: {
      type: "noul",
      instructions: "Does this request require vision or image understanding?",
    },
    is_code: {
      type: "noul",
      instructions: "Is this primarily a programming or repository task?",
    },
    needs_tools: {
      type: "noul",
      instructions: "Does this request need tool or function calling?",
    },
    complexity: {
      type: "score",
      instructions: "How hard is this request?",
      criteria: [
        "Trivial lookup or rewrite",
        "Standard production task",
        "Hard multi-step reasoning",
        "Frontier-only work",
      ],
    },
  };
}

export function assertAnswerType<T extends Answer["type"]>(
  answer: Answer,
  type: T,
): Extract<Answer, { type: T }> {
  if (answer.type !== type) {
    throw new Error(`Expected ${type} answer, received ${answer.type}`);
  }
  return answer as Extract<Answer, { type: T }>;
}
