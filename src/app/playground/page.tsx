import { PlaygroundClient } from "@/components/playground-client";

export default function PlaygroundPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-3xl font-medium tracking-tight">Playground</h1>
        <p className="text-muted-foreground">
          Send state. Inspect Jev’s Choice, Score, and Noul answers. See which
          catalog model Ailerix banks to. Completions are mocked unless you
          attach provider keys later.
        </p>
      </div>
      <PlaygroundClient />
    </div>
  );
}
