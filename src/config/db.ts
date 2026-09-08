import { prisma } from '../db/prisma.js';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let connected = false;

export async function connectDatabase() {
  // Verify the pool with a real query — $connect() alone can succeed with a stale client.
  await prisma.$queryRawUnsafe('SELECT 1');
  if (!connected) {
    connected = true;
    logger.info({ host: safeDbHost(env.DATABASE_URL) }, 'PostgreSQL connected');
  }
  return prisma;
}

export async function disconnectDatabase() {
  connected = false;
  await prisma.$disconnect();
}

function safeDbHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

export function describeDatabaseError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';

  if (code === 'P1000' || /Authentication failed against database server/i.test(message)) {
    return 'PostgreSQL authentication failed. Update DATABASE_URL password (URL-encode @ as %40) and restart the server / Vercel env.';
  }
  if (code === 'P1001' || /Can't reach database server/i.test(message)) {
    return 'Cannot reach PostgreSQL. Use the Supabase Session pooler URL (*.pooler.supabase.com:5432) for Vercel, confirm the project is not paused, and set DATABASE_URL + DIRECT_URL.';
  }
  if (code === 'P1017' || /Server has closed the connection/i.test(message)) {
    return 'PostgreSQL closed the connection. Retry; if it persists, check SSL (sslmode=require) and pool settings.';
  }
  if (/DATABASE_URL|POSTGRES/i.test(message)) {
    return message;
  }
  return `Database unavailable (${code || 'error'}). Set DATABASE_URL to a reachable Postgres connection string.`;
}
