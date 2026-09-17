#!/bin/sh
# Fail-closed allowlist for Ailerix MCP tools (stdin: beforeMCPExecution JSON).
set -e

payload=$(cat)

echo "$payload" | python3 -c '
import json
import sys

ALLOWED = frozenset({
    "route_preview",
    "create_completion",
    "get_generation",
    "analytics_summary",
    "credit_balance",
    "buy_credits",
})

try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(2)

server = (
    data.get("mcp_server_name")
    or data.get("server")
    or data.get("mcpServerName")
    or ""
)
tool = data.get("tool_name") or data.get("toolName") or ""

if server != "ailerix":
    sys.exit(0)

if tool in ALLOWED:
    sys.exit(0)

sys.exit(2)
'
