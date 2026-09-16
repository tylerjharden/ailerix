"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { AilerixMark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/playground", label: "Playground" },
  { href: "/models", label: "Models" },
  { href: "/docs", label: "Docs" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-medium">
          <AilerixMark className="size-7" />
          <span className="tracking-tight">Ailerix</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden md:block">
          <Button asChild size="sm">
            <Link href="/playground">Bank a request</Link>
          </Button>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon-sm" className="md:hidden">
              <Menu />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>Ailerix</SheetTitle>
            </SheetHeader>
            <Separator />
            <div className="flex flex-col gap-1 p-2">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm hover:bg-secondary"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
