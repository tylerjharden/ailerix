import { apiError } from "@/lib/api-error";
import {
  evaluateSystemOne,
  isSystemOneModel,
  type Question,
  type SystemOneState,
} from "@/lib/system-one";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseQuestion(value: unknown): Question {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Each question needs a type.");
  }

  switch (value.type) {
    case "choice": {
      if (!isRecord(value.criteria)) {
        throw new Error("Choice questions need criteria.");
      }
      const criteria = Object.fromEntries(
        Object.entries(value.criteria).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
      return {
        type: "choice",
        instructions:
          typeof value.instructions === "string" ? value.instructions : "",
        criteria,
      };
    }
    case "score": {
      if (!Array.isArray(value.criteria) || value.criteria.some((item) => typeof item !== "string")) {
        throw new Error("Score questions need an ordered string criteria list.");
      }
      return {
        type: "score",
        instructions:
          typeof value.instructions === "string" ? value.instructions : "",
        criteria: value.criteria,
      };
    }
    case "noul":
      return {
        type: "noul",
        instructions:
          typeof value.instructions === "string" ? value.instructions : "",
      };
    default:
      throw new Error(`Unsupported question type: ${value.type}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      state?: SystemOneState;
      model?: string;
      questions?: Record<string, unknown>;
    };

    if (body.state === undefined) {
      return apiError({
        status: 400,
        message: "state is required",
        code: "invalid_request",
        errorType: "invalid_request",
      });
    }
    if (!body.questions || Object.keys(body.questions).length === 0) {
      return apiError({
        status: 400,
        message: "questions are required",
        code: "invalid_request",
        errorType: "invalid_request",
      });
    }
    const model =
      body.model === undefined
        ? undefined
        : isSystemOneModel(body.model)
          ? body.model
          : null;
    if (model === null) {
      return apiError({
        status: 400,
        message: "Unknown System One model",
        code: "invalid_request",
        errorType: "invalid_request",
      });
    }

    const questions = Object.fromEntries(
      Object.entries(body.questions).map(([id, question]) => [
        id,
        parseQuestion(question),
      ]),
    );

    const result = await evaluateSystemOne({
      state: body.state,
      model,
      questions,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Routing failed";
    return apiError({
      status: 400,
      message,
      code: "invalid_request",
      errorType: "invalid_request",
    });
  }
}
