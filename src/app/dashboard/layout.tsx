"use client";

import { Suspense, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  Key,
  LayoutDashboard,
  List,
  Radar,
  Settings,
  Shapes,
  User,
  SlidersHorizontal,
} from "lucide-react";
import { Show, useUser } from "@clerk/nextjs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { authEnabled } from "@/lib/auth-config";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  tab?: string;
};

const WORKSPACE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  {
    href: "/dashboard?tab=api-keys",
    label: "API Keys",
    icon: Key,
    tab: "api-keys",
  },
  {
    href: "/dashboard?tab=families",
    label: "Families",
    icon: Shapes,
    tab: "families",
  },
  {
    href: "/dashboard?tab=observability",
    label: "Observability",
    icon: Radar,
    tab: "observability",
  },
  {
    href: "/dashboard?tab=settings",
    label: "Settings",
    icon: Settings,
    tab: "settings",
  },
];

const ACCOUNT_NAV: NavItem[] = [
  {
    href: "/dashboard?tab=profile",
    label: "Profile",
    icon: User,
    tab: "profile",
  },
  {
    href: "/dashboard?tab=activity",
    label: "Activity",
    icon: BarChart3,
    tab: "activity",
  },
  { href: "/dashboard?tab=logs", label: "Logs", icon: List, tab: "logs" },
  {
    href: "/dashboard?tab=credits",
    label: "Credits",
    icon: CreditCard,
    tab: "credits",
  },
  {
    href: "/dashboard?tab=preferences",
    label: "Preferences",
    icon: SlidersHorizontal,
    tab: "preferences",
  },
];

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function OperatorIdentityHeader() {
  return (
    <header className="flex items-center gap-4">
      <Avatar className="size-14">
        <AvatarFallback className="bg-primary/10 text-lg text-primary">
          OP
        </AvatarFallback>
      </Avatar>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operator</h1>
        <p className="text-sm text-muted-foreground">operator@ailerix.com</p>
      </div>
    </header>
  );
}

function ClerkIdentityHeader() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <header className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarFallback className="bg-primary/10 text-lg text-primary">
            …
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Loading…</h1>
          <p className="text-sm text-muted-foreground">&nbsp;</p>
        </div>
      </header>
    );
  }

  const displayName =
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "Account";
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    "";

  return (
    <header className="flex items-center gap-4">
      <Avatar className="size-14">
        {user?.imageUrl ? (
          <AvatarImage src={user.imageUrl} alt={displayName} />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-lg text-primary">
          {initialsFrom(displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {displayName}
        </h1>
        {email ? (
          <p className="truncate text-sm text-muted-foreground">{email}</p>
        ) : null}
      </div>
    </header>
  );
}

function DashboardIdentityHeader() {
  if (!authEnabled()) {
    return <OperatorIdentityHeader />;
  }

  return (
    <>
      <Show when="signed-in" fallback={<OperatorIdentityHeader />}>
        <ClerkIdentityHeader />
      </Show>
    </>
  );
}

function isActive(item: NavItem, tab: string | null, pathname: string): boolean {
  if (pathname !== "/dashboard") return false;
  if (item.tab) return item.tab === tab;
  return !tab || tab === "overview";
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <item.icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-start">
      <aside className="hidden w-56 shrink-0 md:block">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <nav className="flex flex-col gap-0.5">
          {WORKSPACE_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item, tab, pathname)}
            />
          ))}
        </nav>
        <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Account
        </p>
        <nav className="flex flex-col gap-0.5">
          {ACCOUNT_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item, tab, pathname)}
            />
          ))}
        </nav>
      </aside>

      <ScrollArea className="w-full md:hidden">
        <div className="flex w-max gap-1 pb-2">
          {[...WORKSPACE_NAV, ...ACCOUNT_NAV].map((item) => (
            <Link
              key={`mobile-${item.href}`}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs",
                isActive(item, tab, pathname)
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="min-w-0 flex-1 space-y-8">
        <DashboardIdentityHeader />
        {children}
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
          Loading dashboard…
        </div>
      }
    >
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
