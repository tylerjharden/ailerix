import { createAilerixMcpHandler } from "@/lib/mcp-tools";

const handler = createAilerixMcpHandler();

export { handler as GET, handler as POST };
