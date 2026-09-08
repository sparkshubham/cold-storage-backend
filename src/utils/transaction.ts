import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma.js';

/** Root client or nested `$transaction` client. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Interactive transactions over remote Postgres (e.g. Supabase) need a longer
 * timeout than Prisma's 5s default — each round-trip can be hundreds of ms.
 */
export async function withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => fn(tx), {
    maxWait: 20_000,
    timeout: 120_000,
  });
}
