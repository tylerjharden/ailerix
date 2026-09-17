import {
  acpResponseHeaders,
  completeCheckoutSession,
  verifyAcpRequestSignature,
} from "@/lib/acp";

type CompleteBody = {
  payment_data?: unknown;
};

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

  let body: CompleteBody;
  try {
    body = JSON.parse(rawBody) as CompleteBody;
  } catch {
    return new Response(
      JSON.stringify({
        error: { message: "Invalid JSON body.", code: "invalid_request" },
      }),
      { status: 400, headers: acpResponseHeaders(request) },
    );
  }

  try {
    const result = await completeCheckoutSession({
      sessionId: id,
      paymentData: body.payment_data,
    });

    return new Response(JSON.stringify(result.body), {
      status: result.ok ? 200 : 402,
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
    return new Response(
      JSON.stringify({
        error: { message: "Complete failed.", code: "server_error" },
      }),
      { status: 500, headers: acpResponseHeaders(request) },
    );
  }
}
