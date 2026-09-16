import fs from "node:fs";
import path from "node:path";

import type { AaSnapshot } from "@/lib/aa/types";

let memoizedSnapshot: AaSnapshot | undefined;

function snapshotPath(): string {
  const override = process.env.AA_SNAPSHOT_PATH;
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "aa-snapshot.json");
}

function validateSnapshot(raw: unknown): AaSnapshot {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("AA snapshot must be a JSON object");
  }

  const snapshot = raw as AaSnapshot;

  if (!Array.isArray(snapshot.models) || snapshot.models.length === 0) {
    throw new Error("AA snapshot models must be a non-empty array");
  }

  for (const model of snapshot.models) {
    const intelligenceCost = model.cost_per_task_usd?.intelligence;
    if (typeof intelligenceCost !== "number" || Number.isNaN(intelligenceCost)) {
      throw new Error(
        `Model ${model.aa_id ?? "unknown"} missing cost_per_task_usd.intelligence`,
      );
    }
  }

  return snapshot;
}

export function loadSnapshot(): AaSnapshot {
  if (memoizedSnapshot) {
    return memoizedSnapshot;
  }

  const filePath = snapshotPath();
  const contents = fs.readFileSync(filePath, "utf8");
  const parsed: unknown = JSON.parse(contents);
  memoizedSnapshot = validateSnapshot(parsed);
  return memoizedSnapshot;
}
