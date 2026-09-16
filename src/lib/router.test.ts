import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@/lib/aa/load";
import { isTaskFamily, TASK_FAMILIES } from "@/lib/families";
import { routeRequest } from "@/lib/router";

describe("routeRequest (local Jev + fixture frontier)", () => {
  it("returns a valid family and snapshot aaId", async () => {
    const decision = await routeRequest({
      state: "Summarize quarterly results for the board.",
      policy: "balanced",
    });

    expect(isTaskFamily(decision.family)).toBe(true);
    expect(TASK_FAMILIES).toContain(decision.family);
    expect(decision.engine).toBe("ailerix-local");

    const snapshot = loadSnapshot();
    const ids = new Set(snapshot.models.map((m) => m.aa_id));
    expect(ids.has(decision.aaId)).toBe(true);
    expect(ids.has(decision.fallbackAaId)).toBe(true);
    expect(decision.reasons.length).toBeGreaterThan(0);
  });

  it("routes a code prompt to a code-capable model", async () => {
    const prompt = `Please fix this TypeScript bug:
    function merge(a, b) {
      return { ...a, ...b };
    }
    stack trace: at compile (app.ts:4)`;

    const decision = await routeRequest({
      state: prompt,
      policy: "balanced",
    });

    expect(decision.family).toBe("coding");
    const snapshot = loadSnapshot();
    const pick = snapshot.models.find((m) => m.aa_id === decision.aaId);
    expect(pick).toBeDefined();
    expect(pick?.capabilities.code).toBe(true);
  });
});
