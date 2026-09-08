import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma.js';

/** Root client or nested `$transaction` client. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => fn(tx));
}
