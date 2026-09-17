import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FAMILY_DESCRIPTIONS, TASK_FAMILIES, type TaskFamily } from "@/lib/families";

function formatFamilyTitle(family: TaskFamily): string {
  return family.replace(/_/g, " ");
}

export function FamiliesTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Frontier routing by family</CardTitle>
          <CardDescription>
            Every request is classified into exactly one task family before the
            cost-per-task Pareto walk runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Jev assigns the family from your prompt and policy signals. Ailerix
            software then selects the cheapest eligible model on the Artificial
            Analysis frontier for that family — you always call{" "}
            <code className="font-mono text-foreground">ailerix/auto</code>, not
            a catalog slug. Family choice drives eligibility filters (vision,
            tools, context) and the quality floor band used during the walk.
          </p>
          <Button variant="outline" size="sm" asChild className="w-fit">
            <Link href="/models">
              See families on the catalog page
              <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {TASK_FAMILIES.map((family) => (
          <Card key={family} size="sm" className="min-w-0">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {formatFamilyTitle(family)}
                </Badge>
              </div>
              <CardTitle className="break-all font-mono text-sm">{family}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {FAMILY_DESCRIPTIONS[family]}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
