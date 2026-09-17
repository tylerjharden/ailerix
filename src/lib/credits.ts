import { createHash, randomUUID } from "node:crypto";

import { dbAvailable, getPrismaClient } from "@/lib/analytics/db";

export const SIGNUP_GRANT_USD = 1.0;
export const ANON_DAILY_CAP = 25;

export function shouldEnforceAnonymousCap(): boolean {
  if (process.env.AILERIX_ENFORCE_ANON_CAP === "1") {
    return true;
  }
  if (process.env.VITEST === "true") {
    return false;
  }
  return true;
}

export type CreditReason =
  | "stripe_checkout"
  | "acp_order"
  | "usage_debit"
  | "signup_grant"
  | "adjustment";

type MemoryAccount = {
  id: string;
  clerkId: string;
  email: string | null;
};

type MemoryLedgerRow = {
  id: string;
  accountId: string;
  deltaUsd: number;
  balanceAfter: number;
  reason: CreditReason;
  ref: string | null;
  createdAt: Date;
};

type MemoryAnonRow = {
  anonId: string;
  day: string;
  count: number;
};

const memoryAccountsByClerk = new Map<string, MemoryAccount>();
const memoryAccountsById = new Map<string, MemoryAccount>();
const memoryLedger: MemoryLedgerRow[] = [];
const memoryAnonUsage = new Map<string, MemoryAnonRow>();

function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function memoryBalance(accountId: string): number {
  for (let i = memoryLedger.length - 1; i >= 0; i -= 1) {
    const row = memoryLedger[i];
    if (row && row.accountId === accountId) {
      return row.balanceAfter;
    }
  }
  return 0;
}

function memoryGrantSignupIfNeeded(accountId: string): void {
  const hasGrant = memoryLedger.some(
    (row) => row.accountId === accountId && row.reason === "signup_grant",
  );
  if (!hasGrant) {
    memoryLedger.push({
      id: `mem_${randomUUID()}`,
      accountId,
      deltaUsd: SIGNUP_GRANT_USD,
      balanceAfter: SIGNUP_GRANT_USD,
      reason: "signup_grant",
      ref: null,
      createdAt: new Date(),
    });
  }
}

function memoryAccountByEmail(
  email: string,
): MemoryAccount | undefined {
  const normalized = email.trim().toLowerCase();
  for (const account of memoryAccountsById.values()) {
    if (account.email?.trim().toLowerCase() === normalized) {
      return account;
    }
  }
  return undefined;
}

export async function ensureAccountByEmail(
  email: string,
): Promise<{ id: string; clerkId: string; email: string | null } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (!dbAvailable()) {
    const existing = memoryAccountByEmail(normalized);
    if (existing) {
      return existing;
    }
    const clerkId = `acp_${createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 28)}`;
    return ensureAccount(clerkId, normalized);
  }

  try {
    const prisma = getPrismaClient();
    const byEmail = await prisma.account.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
    });
    if (byEmail) {
      return byEmail;
    }
    const clerkId = `acp_${createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 28)}`;
    return ensureAccount(clerkId, normalized);
  } catch {
    return null;
  }
}

export async function ensureAccount(
  clerkId: string,
  email?: string | null,
): Promise<{ id: string; clerkId: string; email: string | null } | null> {
  if (!dbAvailable()) {
    let account = memoryAccountsByClerk.get(clerkId);
    if (!account) {
      account = {
        id: `mem_acc_${randomUUID()}`,
        clerkId,
        email: email ?? null,
      };
      memoryAccountsByClerk.set(clerkId, account);
      memoryAccountsById.set(account.id, account);
      memoryGrantSignupIfNeeded(account.id);
    } else if (email && !account.email) {
      account.email = email;
    }
    return account;
  }

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.account.findUnique({ where: { clerkId } });
    if (existing) {
      if (email && !existing.email) {
        return prisma.account.update({
          where: { id: existing.id },
          data: { email },
        });
      }
      return existing;
    }

    const account = await prisma.account.create({
      data: { clerkId, email: email ?? null },
    });
    await grantCredits({
      accountId: account.id,
      usd: SIGNUP_GRANT_USD,
      reason: "signup_grant",
      ref: null,
    });
    return account;
  } catch {
    return null;
  }
}

export type LedgerEntry = {
  id: string;
  deltaUsd: number;
  balanceAfter: number;
  reason: CreditReason;
  ref: string | null;
  createdAt: Date;
};

export async function hasLedgerRef(ref: string): Promise<boolean> {
  if (!ref) {
    return false;
  }
  if (!dbAvailable()) {
    return memoryLedger.some((row) => row.ref === ref);
  }
  try {
    const prisma = getPrismaClient();
    const row = await prisma.creditLedger.findFirst({
      where: { ref },
      select: { id: true },
    });
    return row !== null;
  } catch {
    return memoryLedger.some((row) => row.ref === ref);
  }
}

export async function listLedgerEntries(
  accountId: string,
  limit = 50,
): Promise<LedgerEntry[]> {
  if (!dbAvailable()) {
    return memoryLedger
      .filter((row) => row.accountId === accountId)
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        deltaUsd: row.deltaUsd,
        balanceAfter: row.balanceAfter,
        reason: row.reason,
        ref: row.ref,
        createdAt: row.createdAt,
      }));
  }

  try {
    const prisma = getPrismaClient();
    const rows = await prisma.creditLedger.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      deltaUsd: row.deltaUsd,
      balanceAfter: row.balanceAfter,
      reason: row.reason as CreditReason,
      ref: row.ref,
      createdAt: row.createdAt,
    }));
  } catch {
    return [];
  }
}

export async function getBalance(accountId: string): Promise<number | null> {
  if (!dbAvailable()) {
    return memoryBalance(accountId);
  }

  try {
    const prisma = getPrismaClient();
    const latest = await prisma.creditLedger.findFirst({
      where: { accountId },
      orderBy: { createdAt: "desc" },
    });
    return latest?.balanceAfter ?? 0;
  } catch {
    return null;
  }
}

export async function grantCredits(input: {
  accountId: string;
  usd: number;
  reason: CreditReason;
  ref: string | null;
}): Promise<{ balanceAfter: number } | null> {
  if (!dbAvailable()) {
    const current = memoryBalance(input.accountId);
    const balanceAfter = current + input.usd;
    memoryLedger.push({
      id: `mem_${randomUUID()}`,
      accountId: input.accountId,
      deltaUsd: input.usd,
      balanceAfter,
      reason: input.reason,
      ref: input.ref,
      createdAt: new Date(),
    });
    return { balanceAfter };
  }

  try {
    const prisma = getPrismaClient();
    return await prisma.$transaction(async (tx) => {
      const latest = await tx.creditLedger.findFirst({
        where: { accountId: input.accountId },
        orderBy: { createdAt: "desc" },
      });
      const current = latest?.balanceAfter ?? 0;
      const balanceAfter = current + input.usd;
      await tx.creditLedger.create({
        data: {
          accountId: input.accountId,
          deltaUsd: input.usd,
          balanceAfter,
          reason: input.reason,
          ref: input.ref,
        },
      });
      return { balanceAfter };
    });
  } catch {
    return null;
  }
}

export async function debitCredits(input: {
  accountId: string;
  usd: number;
  reason: CreditReason;
  ref: string | null;
}): Promise<{ balanceAfter: number } | null> {
  if (input.usd <= 0) {
    return getBalance(input.accountId).then((b) =>
      b === null ? null : { balanceAfter: b },
    );
  }

  if (!dbAvailable()) {
    const current = memoryBalance(input.accountId);
    const balanceAfter = current - input.usd;
    memoryLedger.push({
      id: `mem_${randomUUID()}`,
      accountId: input.accountId,
      deltaUsd: -input.usd,
      balanceAfter,
      reason: input.reason,
      ref: input.ref,
      createdAt: new Date(),
    });
    return { balanceAfter };
  }

  try {
    const prisma = getPrismaClient();
    return await prisma.$transaction(async (tx) => {
      const latest = await tx.creditLedger.findFirst({
        where: { accountId: input.accountId },
        orderBy: { createdAt: "desc" },
      });
      const current = latest?.balanceAfter ?? 0;
      const balanceAfter = current - input.usd;
      await tx.creditLedger.create({
        data: {
          accountId: input.accountId,
          deltaUsd: -input.usd,
          balanceAfter,
          reason: input.reason,
          ref: input.ref,
        },
      });
      return { balanceAfter };
    });
  } catch {
    return null;
  }
}

export function hashAnonId(ip: string, day: string): string {
  return createHash("sha256").update(`${ip}:${day}`, "utf8").digest("hex");
}

export async function incrementAnonymousUsage(anonId: string): Promise<{
  count: number;
  overLimit: boolean;
}> {
  const day = utcDayKey();

  if (!dbAvailable()) {
    const key = `${anonId}:${day}`;
    const existing = memoryAnonUsage.get(key);
    const count = (existing?.count ?? 0) + 1;
    memoryAnonUsage.set(key, { anonId, day, count });
    const overLimit = shouldEnforceAnonymousCap() && count > ANON_DAILY_CAP;
    return { count, overLimit };
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.anonymousUsage.upsert({
      where: { anonId_day: { anonId, day } },
      create: { anonId, day, count: 1 },
      update: { count: { increment: 1 } },
    });
    const overLimit =
      shouldEnforceAnonymousCap() && row.count > ANON_DAILY_CAP;
    return { count: row.count, overLimit };
  } catch {
    const key = `${anonId}:${day}`;
    const existing = memoryAnonUsage.get(key);
    const count = (existing?.count ?? 0) + 1;
    memoryAnonUsage.set(key, { anonId, day, count });
    const overLimit = shouldEnforceAnonymousCap() && count > ANON_DAILY_CAP;
    return { count, overLimit };
  }
}

export const USAGE_DEBIT_MULTIPLIER = 1.1;

export function usageDebitUsd(estimatedTurnUsd: number | null | undefined): number {
  return (estimatedTurnUsd ?? 0) * USAGE_DEBIT_MULTIPLIER;
}

export function isZeroCostRoute(aaId: string, costPerTaskUsd: number): boolean {
  return aaId === "echo-local" || costPerTaskUsd === 0;
}

export function getUsageUsd(accountId: string): number {
  return memoryLedger
    .filter((row) => row.accountId === accountId && row.reason === "usage_debit")
    .reduce((sum, row) => sum + Math.abs(row.deltaUsd), 0);
}

export async function insufficientCreditsForExecution(
  accountId: string,
  aaId: string,
  costPerTaskUsd: number,
): Promise<boolean> {
  if (isZeroCostRoute(aaId, costPerTaskUsd)) {
    return false;
  }
  const balance = await getBalance(accountId);
  if (balance === null) {
    return false;
  }
  return balance <= 0;
}

/** Test-only: reset in-memory credit and anon state. */
export function _resetCreditsMemoryForTests(): void {
  memoryAccountsByClerk.clear();
  memoryAccountsById.clear();
  memoryLedger.length = 0;
  memoryAnonUsage.clear();
}
