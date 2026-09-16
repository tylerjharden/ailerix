export async function GET() {
  return Response.json({
    object: "list",
    data: [
      {
        id: "ailerix/auto",
        object: "model",
        owned_by: "ailerix",
        description:
          "Jev-classified task routed along the Artificial Analysis cost-per-task Pareto chain.",
      },
    ],
  });
}
