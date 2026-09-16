"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CATALOG,
  formatUsd,
  isModelCapability,
  type ModelCapability,
} from "@/lib/models";

const FILTERS = ["all", ...new Set(CATALOG.flatMap((model) => model.capabilities))] as const;

export function ModelCatalog() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CATALOG.filter((model) => {
      const matchesQuery =
        needle.length === 0 ||
        `${model.id} ${model.name} ${model.provider} ${model.summary}`
          .toLowerCase()
          .includes(needle);
      const matchesFilter =
        filter === "all" ||
        (isModelCapability(filter) && model.capabilities.includes(filter));
      return matchesQuery && matchesFilter;
    });
  }, [filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search models or providers"
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className="rounded-full"
            >
              <Badge variant={filter === item ? "default" : "outline"}>
                {item}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No models match</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Clear the search or pick another capability. Echo Local is always
            available as a fallback.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Input / MTok</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Capabilities</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell>
                      <div className="font-medium">{model.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {model.id}
                      </div>
                    </TableCell>
                    <TableCell>{model.context.toLocaleString()}</TableCell>
                    <TableCell>{formatUsd(model.inputPerMTok)}</TableCell>
                    <TableCell>{model.latencyMs} ms</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {model.capabilities.map((capability: ModelCapability) => (
                          <Badge key={capability} variant="secondary">
                            {capability}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden">
            {rows.map((model) => (
              <Card key={model.id} size="sm">
                <CardHeader>
                  <CardTitle>{model.name}</CardTitle>
                  <p className="font-mono text-xs text-muted-foreground">
                    {model.id}
                  </p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>{model.summary}</p>
                  <p>
                    {formatUsd(model.inputPerMTok)} / MTok · {model.latencyMs} ms
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {model.capabilities.map((capability) => (
                      <Badge key={capability} variant="secondary">
                        {capability}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
