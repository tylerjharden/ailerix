import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";

import { ActivityTab } from "@/components/dashboard/activity-tab";
import { ApiKeysPanel } from "@/components/dashboard/api-keys-panel";
import {
  CreditsPanel,
  type CreditsLedgerRow,
} from "@/components/dashboard/credits-panel";
import { FamiliesTab } from "@/components/dashboard/families-tab";
import { LogsTable } from "@/components/dashboard/logs-table";
import { ObservabilityPanel } from "@/components/dashboard/observability";
import { ProfileTab } from "@/components/dashboard/profile-tab";
import { SettingsPreferencesPanel } from "@/components/dashboard/settings-preferences-panel";
import { DashboardOverview } from "@/components/dashboard/usage-summary";
import { authEnabled } from "@/lib/auth-config";
import {
  ensureAccount,
  getBalance,
  listLedgerEntries,
} from "@/lib/credits";
import { CREDIT_PACKS, stripeEnabled } from "@/lib/stripe";

async function CreditsTab({
  checkoutStatus,
}: {
  checkoutStatus: string | null;
}) {
  let accountReady = false;
  let balanceUsd = 0;
  let ledger: CreditsLedgerRow[] = [];

  if (authEnabled()) {
    const session = await auth();
    if (session.userId) {
      const email =
        session.sessionClaims?.email &&
        typeof session.sessionClaims.email === "string"
          ? session.sessionClaims.email
          : undefined;
      const account = await ensureAccount(session.userId, email);
      if (account) {
        accountReady = true;
        balanceUsd = (await getBalance(account.id)) ?? 0;
        const rows = await listLedgerEntries(account.id);
        ledger = rows.map((row) => ({
          id: row.id,
          deltaUsd: row.deltaUsd,
          balanceAfter: row.balanceAfter,
          reason: row.reason,
          ref: row.ref,
          createdAt: row.createdAt.toISOString(),
        }));
      }
    }
  }

  return (
    <CreditsPanel
      accountReady={accountReady}
      authEnabled={authEnabled()}
      balanceUsd={balanceUsd}
      ledger={ledger}
      packs={CREDIT_PACKS}
      stripeConfigured={stripeEnabled()}
      checkoutStatus={checkoutStatus}
    />
  );
}

function SettingsPreferencesTab({ tab }: { tab: "settings" | "preferences" }) {
  const heading = tab === "settings" ? "Settings" : "Preferences";
  return (
    <SettingsPreferencesPanel
      heading={heading}
      authEnabled={authEnabled()}
      stripeConfigured={stripeEnabled()}
    />
  );
}

async function DashboardBody({
  tab,
  checkoutStatus,
}: {
  tab: string | null;
  checkoutStatus: string | null;
}) {
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

  if (tab === "api-keys") {
    return <ApiKeysPanel />;
  }

  if (tab === "credits") {
    return <CreditsTab checkoutStatus={checkoutStatus} />;
  }

  if (tab === "families") {
    return <FamiliesTab />;
  }

  if (tab === "profile") {
    return <ProfileTab />;
  }

  if (tab === "activity") {
    return <ActivityTab />;
  }

  if (tab === "settings") {
    return <SettingsPreferencesTab tab="settings" />;
  }

  if (tab === "preferences") {
    return <SettingsPreferencesTab tab="preferences" />;
  }

  return <DashboardOverview />;
}

async function DashboardPageInner({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab ?? null;
  const checkoutStatus =
    typeof params.status === "string" ? params.status : null;
  return <DashboardBody tab={tab} checkoutStatus={checkoutStatus} />;
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
