import Link from "next/link";
import { AilerixMark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/playground", label: "Playground" },
      { href: "/models", label: "Families" },
      { href: "/docs", label: "Docs" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "#", label: "About" },
      {
        href: "https://github.com/tylerjharden/ailerix",
        label: "GitHub",
        external: true,
      },
      { href: "https://ailerix.com", label: "ailerix.com", external: true },
    ],
  },
  {
    title: "Developer",
    links: [
      { href: "/docs", label: "API reference" },
      { href: "/docs#mcp", label: "MCP server" },
      { href: "/docs", label: "Spec" },
      { href: "#", label: "Status" },
    ],
  },
  {
    title: "Connect",
    links: [
      {
        href: "https://github.com/tylerjharden/ailerix",
        label: "GitHub",
        external: true,
      },
      { href: "#", label: "X" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-muted/20">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-3 sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-medium">
              <AilerixMark className="size-7" />
              <span className="tracking-tight">Ailerix</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Ailerix
            </p>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="mb-3 text-sm font-semibold">{column.title}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        className="hover:text-foreground"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="hover:text-foreground">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border/60 pt-10">
          <h3 className="text-sm font-semibold">Get the Ailerix newsletter</h3>
          <form
            className="mt-3 flex max-w-md flex-col gap-2 sm:flex-row"
            action="#"
            aria-label="Newsletter signup (not connected in this preview)"
          >
            <Input
              type="email"
              name="email"
              placeholder="you@example.com"
              aria-label="Email address for newsletter"
              className="bg-background"
            />
            <Button type="submit" aria-label="Subscribe to newsletter">
              Subscribe
            </Button>
          </form>
          <p className="mt-3 max-w-xl text-xs text-muted-foreground">
            By subscribing you agree to receive product updates and routing
            research notes, about one email a week. Unsubscribe anytime. See our{" "}
            <Link href="#" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
