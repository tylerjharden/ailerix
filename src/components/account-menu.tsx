"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import {
  BarChart3,
  ChevronDown,
  CreditCard,
  List,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  User,
} from "lucide-react";
import {
  Show,
  useClerk,
  useUser,
} from "@clerk/nextjs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { authEnabled } from "@/lib/auth-config";

const ACCOUNT_LINKS = [
  { href: "/dashboard?tab=profile", label: "Profile", icon: User },
  { href: "/dashboard?tab=activity", label: "Activity", icon: BarChart3 },
  { href: "/dashboard?tab=logs", label: "Logs", icon: List },
  { href: "/dashboard?tab=credits", label: "Credits", icon: CreditCard },
  {
    href: "/dashboard?tab=preferences",
    label: "Preferences",
    icon: Settings,
  },
] as const;

type ThemeChoice = "light" | "dark" | "system";

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function ThemeToggleRow() {
  const { theme, setTheme } = useTheme();
  const resolved: ThemeChoice =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system";

  return (
    <div className="p-2">
      <div
        className="flex rounded-lg border border-border bg-muted/50 p-0.5"
        role="group"
        aria-label="Theme"
      >
        {(
          [
            { value: "light" as const, icon: Sun, label: "Light" },
            { value: "dark" as const, icon: Moon, label: "Dark" },
            { value: "system" as const, icon: Monitor, label: "System" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={resolved === option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors",
              resolved === option.value
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <option.icon className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

function AccountLinks() {
  return (
    <>
      {ACCOUNT_LINKS.map((item) => (
        <DropdownMenuItem key={item.href} asChild>
          <Link href={item.href} className="flex items-center gap-2">
            <item.icon className="size-4" />
            {item.label}
          </Link>
        </DropdownMenuItem>
      ))}
    </>
  );
}

function StaticOperatorMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2 px-2 text-sm font-normal"
          aria-label="Open account menu"
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              ?
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-primary sm:inline">Demo mode</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal">
          <div className="flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-xs text-primary">
                OP
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-primary">Demo mode</span>
              <span className="text-xs text-muted-foreground">
                Sign-in not configured
              </span>
            </div>
          </div>
          <Settings className="size-4 text-muted-foreground" aria-hidden />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AccountLinks />
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-destructive focus:text-destructive">
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeToggleRow />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClerkAccountMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();

  const displayName =
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "Account";
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    "";
  const avatarInitials = initialsFrom(displayName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2 px-2 text-sm font-normal"
          aria-label="Open account menu"
        >
          <Avatar className="size-7">
            {user?.imageUrl ? (
              <AvatarImage src={user.imageUrl} alt={displayName} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {avatarInitials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[8rem] truncate text-primary sm:inline">
            {displayName}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal">
          <div className="flex items-center gap-2">
            <Avatar className="size-8">
              {user?.imageUrl ? (
                <AvatarImage src={user.imageUrl} alt={displayName} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-xs text-primary">
                {avatarInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-primary">
                {displayName}
              </span>
              {email ? (
                <span className="truncate text-xs text-muted-foreground">
                  {email}
                </span>
              ) : null}
            </div>
          </div>
          <Settings className="size-4 text-muted-foreground" aria-hidden />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AccountLinks />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => signOut({ redirectUrl: "/" })}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeToggleRow />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AccountMenu() {
  if (!authEnabled()) {
    return <StaticOperatorMenu />;
  }

  return (
    <>
      <Show when="signed-in">
        <ClerkAccountMenu />
      </Show>
      <Show when="signed-out">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="gap-2 px-2 text-sm font-normal"
              aria-label="Open account menu"
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  ?
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-primary sm:inline">Sign in</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/sign-in">Sign in</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <ThemeToggleRow />
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
    </>
  );
}
