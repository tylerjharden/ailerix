import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";

import { TASK_FAMILIES } from "@/lib/families";
import {
  handleRoutePreview,
  isTaskFamilyValue,
  MCP_TOOL_NAMES,
  registerAilerixMcpTools,
} from "@/lib/mcp-tools";

describe("MCP tools", () => {
  it("registers exactly six tools", () => {
    expect(MCP_TOOL_NAMES).toHaveLength(6);
    const server = new McpServer({ name: "test", version: "0.0.0" });
    expect(() => registerAilerixMcpTools(server)).not.toThrow();
  });

  it("route_preview returns a valid task family on the fixture", async () => {
    const result = await handleRoutePreview({
      prompt: "refactor this function and fix the stack trace",
      policy: "balanced",
    });
    expect(isTaskFamilyValue(result.family)).toBe(true);
    expect(TASK_FAMILIES).toContain(result.family);
    expect(result.aa_id).toBeTruthy();
    expect(typeof result.cost_per_task_usd).toBe("number");
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
