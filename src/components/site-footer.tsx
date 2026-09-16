import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Ailerix banks each request with a typed System One decision.</p>
        <div className="flex gap-4">
          <Link href="/docs" className="hover:text-foreground">
            API
          </Link>
          <Link href="/models" className="hover:text-foreground">
            Catalog
          </Link>
          <a
            href="https://typesafe.ai/blog/introducing-system-one-models-and-jev"
            className="hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Jev
          </a>
        </div>
      </div>
    </footer>
  );
}
