import { ModelCatalog } from "@/components/model-catalog";

export default function ModelsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-3xl font-medium tracking-tight">Model catalog</h1>
        <p className="text-muted-foreground">
          Same idea as OpenRouter’s directory — one id per upstream model —
          except Ailerix treats{" "}
          <code className="font-mono text-foreground">ailerix/auto</code> as
          the default and lets Jev choose.
        </p>
      </div>
      <ModelCatalog />
    </div>
  );
}
