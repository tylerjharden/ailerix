import { CATALOG } from "@/lib/models";

export async function GET() {
  return Response.json({
    object: "list",
    data: CATALOG.map((model) => ({
      id: model.id,
      object: "model",
      owned_by: model.provider,
      context_length: model.context,
      pricing: {
        prompt: model.inputPerMTok,
        completion: model.outputPerMTok,
      },
      latency_ms: model.latencyMs,
      capabilities: model.capabilities,
      quality: model.quality,
      summary: model.summary,
    })),
  });
}
