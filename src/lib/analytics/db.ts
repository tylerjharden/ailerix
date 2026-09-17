import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function dbAvailable(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === "string" && url.length > 0;
}

export function getPrismaClient(): PrismaClient {
  if (!dbAvailable()) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL!;
    const pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}
