import {
  acpResponseHeaders,
  buildCheckoutSessionBody,
  cancelCheckoutSession,
  verifyAcpRequestSignature,
} from "@/lib/acp";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const rawBody = await request.text();
  if (!verifyAcpRequestSignature(request, rawBody)) {
    return new Response(
      JSON.stringify({
        error: { message: "Invalid signature.", code: "invalid_signature" },
      }),
      { status: 401, headers: acpResponseHeaders(request) },
    );
  }

  try {
    const session = await cancelCheckoutSession(id);
    return new Response(JSON.stringify(buildCheckoutSessionBody(session)), {
      status: 200,
      headers: acpResponseHeaders(request),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      return new Response(
        JSON.stringify({
          error: { message: "Checkout session not found.", code: "not_found" },
        }),
        { status: 404, headers: acpResponseHeaders(request) },
      );
    }
    if (err instanceof Error && err.message === "completed") {
      return new Response(
        JSON.stringify({
          error: {
            message: "Completed sessions cannot be canceled.",
            code: "method_not_allowed",
          },
        }),
        { status: 405, headers: acpResponseHeaders(request) },
      );
    }
    return new Response(
      JSON.stringify({
        error: { message: "Cancel failed.", code: "server_error" },
      }),
      { status: 500, headers: acpResponseHeaders(request) },
    );
  }
}
