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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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

export function AccountMenu() {
  const { theme, setTheme } = useTheme();
  const resolved: ThemeChoice =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system";

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
              OP
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-primary sm:inline">Operator</span>
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
              <span className="text-sm font-medium text-primary">Operator</span>
              <span className="text-xs text-muted-foreground">
                operator@ailerix.com
              </span>
            </div>
          </div>
          <Settings className="size-4 text-muted-foreground" aria-hidden />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACCOUNT_LINKS.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} className="flex items-center gap-2">
              <item.icon className="size-4" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuItem
              disabled
              className="text-destructive focus:text-destructive"
              onSelect={(e) => e.preventDefault()}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </TooltipTrigger>
          <TooltipContent side="left">No accounts in this slice</TooltipContent>
        </Tooltip>
        <DropdownMenuSeparator />
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
