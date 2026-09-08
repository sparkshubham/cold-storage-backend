import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// Reuse across hot reloads and Vercel warm invocations (avoids reconnect latency).
globalForPrisma.prisma = prisma;

export type DbClient = PrismaClient;
