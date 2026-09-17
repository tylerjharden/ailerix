import {
  acpResponseHeaders,
  buildCheckoutSessionBody,
  getAcpSession,
  updateCheckoutSession,
  verifyAcpRequestSignature,
  type AcpLineItemInput,
} from "@/lib/acp";

type UpdateBody = {
  line_items?: AcpLineItemInput[];
  buyer?: { email?: string };
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await getAcpSession(id);
  if (!session) {
    return new Response(
      JSON.stringify({
        error: { message: "Checkout session not found.", code: "not_found" },
      }),
      { status: 404, headers: acpResponseHeaders(request) },
    );
  }

  return new Response(JSON.stringify(buildCheckoutSessionBody(session)), {
    status: 200,
    headers: acpResponseHeaders(request),
  });
}

export async function PATCH(
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
      { status: 401, headers: acpResponseHeaders(request),
      },
    );
  }

  let body: UpdateBody;
  try {
    body = JSON.parse(rawBody) as UpdateBody;
  } catch {
    return new Response(
      JSON.stringify({
        error: { message: "Invalid JSON body.", code: "invalid_request" },
      }),
      { status: 400, headers: acpResponseHeaders(request) },
    );
  }

  try {
    const session = await updateCheckoutSession(id, body);
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
            message: "Completed sessions cannot be updated.",
            code: "invalid_state",
          },
        }),
        { status: 409, headers: acpResponseHeaders(request) },
      );
    }
    const message = err instanceof Error ? err.message : "Update failed.";
    return new Response(
      JSON.stringify({ error: { message, code: "invalid_request" } }),
      { status: 400, headers: acpResponseHeaders(request) },
    );
  }
}
