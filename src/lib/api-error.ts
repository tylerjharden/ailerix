export const ERROR_TYPES = [
  "invalid_request",
  "model_not_allowed",
  "parameter_not_allowed",
  "not_found",
  "payment_required",
  "rate_limit_exceeded",
  "provider_unavailable",
  "timeout",
  "server",
] as const;

export type ErrorType = (typeof ERROR_TYPES)[number];

function openAiErrorType(errorType: ErrorType): "invalid_request_error" | "api_error" {
  switch (errorType) {
    case "invalid_request":
    case "model_not_allowed":
    case "parameter_not_allowed":
    case "not_found":
    case "payment_required":
    case "rate_limit_exceeded":
      return "invalid_request_error";
    case "provider_unavailable":
    case "timeout":
    case "server":
      return "api_error";
    default: {
      const _exhaustive: never = errorType;
      throw new Error(`Unhandled error type: ${String(_exhaustive)}`);
    }
  }
}

export type ApiErrorEnvelope = {
  error: {
    message: string;
    type: "invalid_request_error" | "api_error";
    code: string;
    metadata: { error_type: ErrorType };
  };
};

export function apiError(input: {
  status: number;
  message: string;
  code: string;
  errorType: ErrorType;
  headers?: HeadersInit;
}): Response {
  const body: ApiErrorEnvelope = {
    error: {
      message: input.message,
      type: openAiErrorType(input.errorType),
      code: input.code,
      metadata: { error_type: input.errorType },
    },
  };
  return Response.json(body, {
    status: input.status,
    headers: input.headers,
  });
}
