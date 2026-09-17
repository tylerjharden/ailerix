"use client";

import Link from "next/link";
import { Monitor, Moon, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ThemeChoice = "light" | "dark" | "system";

type SettingsPreferencesPanelProps = {
  heading: "Settings" | "Preferences";
  authEnabled: boolean;
  stripeConfigured: boolean;
};

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const resolved: ThemeChoice =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system";

  return (
    <div
      className="flex w-full max-w-sm rounded-lg border border-border bg-muted/50 p-0.5"
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
            "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors sm:text-sm",
            resolved === option.value
              ? "bg-background text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <option.icon className="size-4 shrink-0" />
          <span className="sr-only sm:not-sr-only sm:inline">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function StatusRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-0">
      <span className="text-sm">{label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
          on
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {on ? "On" : "Off"}
      </span>
    </div>
  );
}

export function SettingsPreferencesPanel({
  heading,
  authEnabled,
  stripeConfigured,
}: SettingsPreferencesPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{heading}</h2>
        <p className="text-sm text-muted-foreground">
          Appearance and deployment capabilities — no placeholder toggles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>
            Choose light, dark, or match your system preference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>
            Profile details and sign-out are managed on the Profile tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/dashboard?tab=profile"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <User className="size-4" />
            Open Profile
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environment</CardTitle>
          <CardDescription>
            What this deployment has configured. Values for secrets are never
            shown here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusRow label="Authentication (Clerk)" on={authEnabled} />
          <StatusRow label="Payments (Stripe credits)" on={stripeConfigured} />
        </CardContent>
      </Card>
    </div>
  );
}
