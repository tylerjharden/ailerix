import { Suspense } from "react";
import { DashboardOverview } from "@/components/dashboard/usage-summary";
import { LogsTable } from "@/components/dashboard/logs-table";
import { ObservabilityPanel } from "@/components/dashboard/observability";

const COMING_SOON_COPY =
  "Detailed views for this section ship with API keys. For now, explore routing in the Playground or read the API reference.";

function DashboardBody({ tab }: { tab: string | null }) {
  const isOverview = !tab || tab === "overview";

  if (isOverview) {
    return <DashboardOverview />;
  }

  if (tab === "logs") {
    return <LogsTable />;
  }

  if (tab === "observability") {
    return <ObservabilityPanel />;
  }

  const title =
    tab === "api-keys"
      ? "API Keys"
      : tab === "families"
        ? "Families"
        : tab === "settings"
          ? "Settings"
          : tab === "profile"
            ? "Profile"
            : tab === "activity"
              ? "Activity"
              : tab === "credits"
                ? "Credits"
                : tab === "preferences"
                  ? "Preferences"
                  : "Dashboard";

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {COMING_SOON_COPY}
      </p>
    </div>
  );
}

async function DashboardPageInner({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab ?? null;
  return <DashboardBody tab={tab} />;
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
      <DashboardPageInner searchParams={searchParams} />
    </Suspense>
  );
}
