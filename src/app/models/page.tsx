import { ModelCatalog } from "@/components/model-catalog";

export default function ModelsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-3xl font-medium tracking-tight">Families</h1>
        <p className="text-muted-foreground">
          Jev classifies every request into one of seven task families. Ailerix
          walks the Artificial Analysis cost-per-task Pareto chain for that
          family — you call{" "}
          <code className="font-mono text-foreground">ailerix/auto</code>, not a
          provider slug.
        </p>
      </div>
      <ModelCatalog />
    </div>
  );
}
