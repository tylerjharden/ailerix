"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { StoredRouteEvent } from "@/lib/analytics/types";
import {
  TASK_FAMILY_LABELS,
  type TaskFamilyKey,
  formatUsd,
} from "@/lib/mock-usage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ApiEventRow = Omit<StoredRouteEvent, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

function isTaskFamilyKey(value: string): value is TaskFamilyKey {
  return value in TASK_FAMILY_LABELS;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function truncateId(id: string): string {
  if (id.length <= 14) {
    return id;
  }
  return `${id.slice(0, 10)}…`;
}

function statusBadge(status: string) {
  switch (status) {
    case "ok":
      return (
        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          ok
        </Badge>
      );
    case "fallback_used":
      return (
        <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400">
          fallback
        </Badge>
      );
    case "provider_error":
      return <Badge variant="destructive">error</Badge>;
    case "route_only":
      return (
        <Badge variant="secondary" className="text-muted-foreground">
          route only
        </Badge>
      );
    case "mocked":
      return <Badge variant="outline">mocked</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function LogsTable() {
  const [rows, setRows] = useState<ApiEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/analytics/events?limit=100");
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "Logs are unavailable in this environment."
            : `Failed to load events (${res.status}).`,
        );
      }
      const body = (await res.json()) as { data: ApiEventRow[] };
      setRows(body.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="text-base font-semibold">Request logs</CardTitle>
        <p className="text-sm text-muted-foreground">
          Recent routed completions and dry-run route calls.
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Could not load logs</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No requests yet —{" "}
              <Link href="/playground" className="text-foreground underline-offset-4 hover:underline">
                hit the playground
              </Link>
              .
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Generation</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>aa_id</TableHead>
                <TableHead>Policy</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cost / task</TableHead>
                <TableHead className="text-right">Est. turn</TableHead>
                <TableHead className="text-right">Total ms</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground">
                    {formatTime(row.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {truncateId(row.generationId)}
                  </TableCell>
                  <TableCell>{row.endpoint}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {isTaskFamilyKey(row.family)
                        ? TASK_FAMILY_LABELS[row.family]
                        : row.family}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.aaId}</TableCell>
                  <TableCell>{row.policy}</TableCell>
                  <TableCell>{statusBadge(row.status)}</TableCell>
                  <TableCell className="text-right">
                    {formatUsd(row.costPerTaskUsd)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.estimatedTurnUsd != null
                      ? formatUsd(row.estimatedTurnUsd)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.totalMs.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
