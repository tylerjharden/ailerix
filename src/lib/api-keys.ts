import { createHash, randomBytes, randomUUID } from "node:crypto";

import { dbAvailable, getPrismaClient } from "@/lib/analytics/db";

const KEY_PREFIX = "ailerix_";
const KEY_HEX_LENGTH = 32;

type MemoryApiKey = {
  id: string;
  accountId: string;
  name: string;
  keyHash: string;
  prefix: string;
  disabled: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
};

const memoryKeysByHash = new Map<string, MemoryApiKey>();
const memoryKeysById = new Map<string, MemoryApiKey>();

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function displayPrefix(fullKey: string): string {
  const secret = fullKey.startsWith(KEY_PREFIX)
    ? fullKey.slice(KEY_PREFIX.length)
    : fullKey;
  return `${KEY_PREFIX}${secret.slice(0, 8)}`;
}

export type ApiKeyListItem = {
  id: string;
  name: string;
  prefix: string;
  disabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

export async function createKey(
  accountId: string,
  name: string,
): Promise<{ id: string; key: string; prefix: string } | null> {
  const secret = randomBytes(KEY_HEX_LENGTH / 2).toString("hex");
  const fullKey = `${KEY_PREFIX}${secret}`;
  const keyHash = sha256(fullKey);
  const prefix = displayPrefix(fullKey);

  if (!dbAvailable()) {
    const id = `mem_key_${randomUUID()}`;
    const row: MemoryApiKey = {
      id,
      accountId,
      name,
      keyHash,
      prefix,
      disabled: false,
      lastUsedAt: null,
      createdAt: new Date(),
    };
    memoryKeysByHash.set(keyHash, row);
    memoryKeysById.set(id, row);
    return { id, key: fullKey, prefix };
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.apiKey.create({
      data: {
        accountId,
        name,
        keyHash,
        prefix,
      },
    });
    return { id: row.id, key: fullKey, prefix };
  } catch {
    return null;
  }
}

export async function verifyKey(
  bearer: string,
): Promise<{ accountId: string; apiKeyId: string } | null> {
  if (!bearer.startsWith(KEY_PREFIX)) {
    return null;
  }

  const keyHash = sha256(bearer);

  if (!dbAvailable()) {
    const row = memoryKeysByHash.get(keyHash);
    if (!row || row.disabled) {
      return null;
    }
    row.lastUsedAt = new Date();
    return { accountId: row.accountId, apiKeyId: row.id };
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.apiKey.findUnique({ where: { keyHash } });
    if (!row || row.disabled) {
      return null;
    }
    void prisma.apiKey
      .update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);
    return { accountId: row.accountId, apiKeyId: row.id };
  } catch {
    const row = memoryKeysByHash.get(keyHash);
    if (!row || row.disabled) {
      return null;
    }
    row.lastUsedAt = new Date();
    return { accountId: row.accountId, apiKeyId: row.id };
  }
}

export async function revokeKey(accountId: string, keyId: string): Promise<boolean> {
  if (!dbAvailable()) {
    const row = memoryKeysById.get(keyId);
    if (!row || row.accountId !== accountId) {
      return false;
    }
    row.disabled = true;
    return true;
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.apiKey.findFirst({
      where: { id: keyId, accountId },
    });
    if (!row) {
      return false;
    }
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { disabled: true },
    });
    return true;
  } catch {
    return false;
  }
}

export async function listKeys(accountId: string): Promise<ApiKeyListItem[]> {
  if (!dbAvailable()) {
    return [...memoryKeysById.values()]
      .filter((row) => row.accountId === accountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => ({
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        disabled: row.disabled,
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      }));
  }

  try {
    const prisma = getPrismaClient();
    const rows = await prisma.apiKey.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      disabled: row.disabled,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export function isAilerixApiKeyToken(token: string): boolean {
  return token.startsWith(KEY_PREFIX);
}

/** Test-only: reset in-memory API keys. */
export function _resetApiKeysMemoryForTests(): void {
  memoryKeysByHash.clear();
  memoryKeysById.clear();
}
