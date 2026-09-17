"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Coins, CreditCard, Loader2 } from "lucide-react";

import type { CreditReason } from "@/lib/credits";
import type { CreditPack, CreditPackId } from "@/lib/stripe";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type CreditsLedgerRow = {
  id: string;
  deltaUsd: number;
  balanceAfter: number;
  reason: CreditReason;
  ref: string | null;
  createdAt: string;
};

type CreditsPanelProps = {
  accountReady: boolean;
  authEnabled: boolean;
  balanceUsd: number;
  ledger: CreditsLedgerRow[];
  packs: CreditPack[];
  stripeConfigured: boolean;
  checkoutStatus: string | null;
};

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function reasonLabel(reason: CreditReason): string {
  switch (reason) {
    case "stripe_checkout":
      return "Stripe purchase";
    case "acp_order":
      return "ACP order";
    case "usage_debit":
      return "API usage";
    case "signup_grant":
      return "Signup grant";
    case "adjustment":
      return "Adjustment";
    default: {
      const _exhaustive: never = reason;
      return String(_exhaustive);
    }
  }
}

function PackButton({
  packId,
  usd,
  title,
  disabled,
  disabledReason,
  loading,
  onBuy,
}: {
  packId: CreditPackId;
  usd: number;
  title: string;
  disabled: boolean;
  disabledReason: string | null;
  loading: boolean;
  onBuy: (packId: CreditPackId) => void;
}) {
  const button = (
    <Button
      type="button"
      variant="outline"
      className="h-auto w-full flex-col gap-1 py-4"
      disabled={disabled || loading}
      onClick={() => onBuy(packId)}
    >
      {loading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (
        <CreditCard className="size-5 text-muted-foreground" />
      )}
      <span className="font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">
        {formatUsd(usd)} balance
      </span>
    </Button>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block w-full">{button}</span>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

export function CreditsPanel({
  accountReady,
  authEnabled,
  balanceUsd,
  ledger,
  packs,
  stripeConfigured,
  checkoutStatus,
}: CreditsPanelProps) {
  const router = useRouter();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [buyingPack, setBuyingPack] = useState<CreditPackId | null>(null);

  const purchaseDisabled = !stripeConfigured || !accountReady;
  const purchaseDisabledReason = !stripeConfigured
    ? "Stripe checkout is not configured on this deployment."
    : !accountReady && authEnabled
      ? "Sign in to purchase credits."
      : !accountReady
        ? "Authentication is not configured."
        : null;

  const buyPack = useCallback(
    async (packId: CreditPackId) => {
      if (purchaseDisabled) {
        return;
      }
      setCheckoutError(null);
      setBuyingPack(packId);
      try {
        const response = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pack: packId }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            body.error?.message ??
              (response.status === 503
                ? "Stripe is not configured."
                : `HTTP ${response.status}`),
          );
        }
        const url = body.data?.url as string | undefined;
        if (!url) {
          throw new Error("Checkout URL missing from response.");
        }
        window.location.href = url;
      } catch (err) {
        setCheckoutError(
          err instanceof Error ? err.message : "Could not start checkout.",
        );
        setBuyingPack(null);
      }
    },
    [purchaseDisabled],
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {checkoutStatus === "success" && (
          <Alert>
            <AlertDescription>
              Payment received. Your balance updates after Stripe confirms the
              checkout (usually within a few seconds).{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => router.refresh()}
              >
                Refresh
              </button>
            </AlertDescription>
          </Alert>
        )}
        {checkoutStatus === "cancelled" && (
          <Alert variant="default">
            <AlertDescription>Checkout was cancelled — no charge.</AlertDescription>
          </Alert>
        )}
        {checkoutError && (
          <Alert variant="destructive">
            <AlertDescription>{checkoutError}</AlertDescription>
          </Alert>
        )}
        {!stripeConfigured && (
          <Alert>
            <AlertDescription>
              Credit purchases are disabled because{" "}
              <code className="text-xs">STRIPE_SECRET_KEY</code> is not set.
              Balances and usage debits still work when an account is present.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="size-5" />
              Credit balance
            </CardTitle>
            <CardDescription>
              Pay-as-you-go API usage debits this balance (estimated turn cost ×
              1.10). Top up with a one-time Stripe checkout.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold tracking-tight tabular-nums">
              {formatUsd(balanceUsd)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buy credits</CardTitle>
            <CardDescription>
              One-time payment — credits are granted instantly after checkout
              completes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {packs.map((pack) => (
                <PackButton
                  key={pack.id}
                  packId={pack.id}
                  usd={pack.usd}
                  title={pack.title}
                  disabled={purchaseDisabled}
                  disabledReason={purchaseDisabledReason}
                  loading={buyingPack === pack.id}
                  onBuy={buyPack}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ledger</CardTitle>
            <CardDescription>Recent balance changes for your account.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ledger entries yet. New accounts receive a signup grant; usage
                and purchases appear here.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{reasonLabel(row.reason)}</Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${
                          row.deltaUsd >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive"
                        }`}
                      >
                        {row.deltaUsd >= 0 ? "+" : ""}
                        {formatUsd(row.deltaUsd)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatUsd(row.balanceAfter)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
