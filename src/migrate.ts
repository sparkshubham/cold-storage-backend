import { logger } from './utils/logger.js';

/**
 * Schema changes are applied with Prisma Migrate (`prisma migrate deploy`).
 * This hook remains for prepare-db / bootstrap compatibility and is intentionally a no-op.
 */
export async function runMigrations() {
  logger.info('Prisma migrations are managed via `prisma migrate deploy` (noop runtime hook)');
}
