import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { runMigrations } from './migrate.js';
import { prisma } from './db/prisma.js';
import { PERMISSIONS } from './config/constants.js';
import { runSeed, syncAccessControl, syncSystemRoles } from './seeds/index.js';
import { logger } from './utils/logger.js';

let preparing: Promise<void> | null = null;
let accessSynced = false;
let accessSyncing: Promise<void> | null = null;

/** Fast path: skip full permission upserts when catalog is already present. */
export async function syncAccessControlOnce(): Promise<void> {
  if (accessSynced) return;
  if (!accessSyncing) {
    accessSyncing = (async () => {
      await connectDatabase();
      const permissionCount = await prisma.permission.count();
      if (permissionCount < PERMISSIONS.length) {
        await syncAccessControl();
      } else {
        await syncSystemRoles();
        logger.info('Access control up to date (skipped permission upserts)');
      }
      accessSynced = true;
    })()
      .catch((err) => {
        accessSyncing = null;
        throw err;
      })
      .then(() => {
        accessSyncing = null;
      });
  }
  await accessSyncing;
}

export async function prepareDatabase(): Promise<void> {
  if (!preparing) {
    preparing = (async () => {
      await connectDatabase();
      await syncAccessControlOnce();
      const seeded = await prisma.user.findFirst({
        where: {
          email: env.SEED_SUPER_ADMIN_EMAIL.toLowerCase(),
          deletedAt: null,
        },
        select: { id: true },
      });
      if (seeded) {
        logger.info('Database already seeded');
        return;
      }
      await runSeed();
      try {
        await runMigrations();
      } catch (err) {
        logger.error({ err }, 'Migration failed after seed; login accounts are still available');
      }
    })().catch((err) => {
      preparing = null;
      throw err;
    });
  }
  await preparing;
}
