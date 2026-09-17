import {
  acpResponseHeaders,
  buildCheckoutSessionBody,
  createCheckoutSession,
  getIdempotentCreateResponse,
  verifyAcpRequestSignature,
  type AcpLineItemInput,
} from "@/lib/acp";

type CreateBody = {
  line_items?: AcpLineItemInput[];
  buyer?: { email?: string };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyAcpRequestSignature(request, rawBody)) {
    return new Response(
      JSON.stringify({
        error: { message: "Invalid signature.", code: "invalid_signature" },
      }),
      { status: 401, headers: acpResponseHeaders(request) },
    );
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const cached = getIdempotentCreateResponse(idempotencyKey);
    if (cached) {
      return new Response(JSON.stringify(cached.body), {
        status: cached.status,
        headers: acpResponseHeaders(request),
      });
    }
  }

  let body: CreateBody;
  try {
    body = JSON.parse(rawBody) as CreateBody;
  } catch {
    return new Response(
      JSON.stringify({
        error: { message: "Invalid JSON body.", code: "invalid_request" },
      }),
      { status: 400, headers: acpResponseHeaders(request) },
    );
  }

  if (!body.line_items?.length) {
    return new Response(
      JSON.stringify({
        error: { message: "line_items is required.", code: "invalid_request" },
      }),
      { status: 400, headers: acpResponseHeaders(request) },
    );
  }

  try {
    const session = await createCheckoutSession({
      line_items: body.line_items,
      buyer: body.buyer,
      idempotencyKey,
    });
    const responseBody = buildCheckoutSessionBody(session);
    return new Response(JSON.stringify(responseBody), {
      status: 201,
      headers: acpResponseHeaders(request),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create session.";
    return new Response(
      JSON.stringify({ error: { message, code: "invalid_request" } }),
      { status: 400, headers: acpResponseHeaders(request) },
    );
  }
}
