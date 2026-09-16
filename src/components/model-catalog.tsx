"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
  FAMILY_DESCRIPTIONS,
  TASK_FAMILIES,
  type TaskFamily,
} from "@/lib/families";
import type { AaSnapshot } from "@/lib/aa/types";

function formatFamilyTitle(family: TaskFamily): string {
  return family.replace(/_/g, " ");
}

export function ModelCatalog() {
  const showOperator = process.env.NODE_ENV !== "production";
  const [snapshot, setSnapshot] = useState<AaSnapshot | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    if (!showOperator) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/v1/internal/catalog");
        if (!response.ok) {
          throw new Error("Catalog unavailable");
        }
        const data = (await response.json()) as AaSnapshot;
        if (!cancelled) {
          setSnapshot(data);
        }
      } catch {
        if (!cancelled) {
          setCatalogError("Could not load fixture snapshot.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showOperator]);

  return (
    <div className="space-y-10">
      <Card>
        <CardHeader>
          <CardTitle>How the frontier walk works</CardTitle>
          <CardDescription>
            Software — not Jev — picks a model row from the checked-in
            Artificial Analysis snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Jev’s <code className="font-mono text-foreground">quality_floor</code>{" "}
            score maps to a percentile band over eligible models in the chosen
            family. The walker builds a cost-per-task Pareto frontier, selects
            the cheapest point at or above that floor, and may{" "}
            <strong className="font-medium text-foreground">next up</strong> one
            step when family or floor confidence is low, or when cost sensitivity
            and gradient favor a slightly pricier point.
          </p>
          <p>
            Eligibility filters vision, tools, code, and context from Jev’s
            nouls. A fallback aa_id is the next point on the frontier; degraded
            paths are flagged when no model clears the floor.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {TASK_FAMILIES.map((family) => (
          <Card key={family} size="sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {formatFamilyTitle(family)}
                </Badge>
              </div>
              <CardTitle className="font-mono text-sm">{family}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {FAMILY_DESCRIPTIONS[family]}
            </CardContent>
          </Card>
        ))}
      </div>

      {showOperator ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-medium tracking-tight">
              Fixture snapshot (operator view)
            </h2>
            <p className="text-sm text-muted-foreground">
              Development only — rows from{" "}
              <code className="font-mono text-foreground">data/aa-snapshot.json</code>
              . Not shown in production builds.
            </p>
          </div>
          {catalogError ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-sm text-muted-foreground">
                {catalogError}
              </CardContent>
            </Card>
          ) : null}
          {snapshot ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>aa_id</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Index</TableHead>
                      <TableHead>Intel $/task</TableHead>
                      <TableHead>Context</TableHead>
                      <TableHead>Capabilities</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.models.map((model) => (
                      <TableRow key={model.aa_id}>
                        <TableCell className="font-mono text-xs">
                          {model.aa_id}
                        </TableCell>
                        <TableCell>{model.name}</TableCell>
                        <TableCell>{model.intelligence_index}</TableCell>
                        <TableCell>
                          ${model.cost_per_task_usd.intelligence.toFixed(3)}
                        </TableCell>
                        <TableCell>
                          {model.context_window.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {model.capabilities.vision ? (
                              <Badge variant="outline">vision</Badge>
                            ) : null}
                            {model.capabilities.tools ? (
                              <Badge variant="outline">tools</Badge>
                            ) : null}
                            {model.capabilities.code ? (
                              <Badge variant="outline">code</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid gap-3 md:hidden">
                {snapshot.models.map((model) => (
                  <Card key={model.aa_id} size="sm">
                    <CardHeader>
                      <CardTitle className="font-mono text-sm">
                        {model.aa_id}
                      </CardTitle>
                      <CardDescription>{model.name}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      Index {model.intelligence_index} · $
                      {model.cost_per_task_usd.intelligence.toFixed(3)}/task
                      intel · {model.context_window.toLocaleString()} ctx
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : !catalogError ? (
            <p className="text-sm text-muted-foreground">Loading snapshot…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
