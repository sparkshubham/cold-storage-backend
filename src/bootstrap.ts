import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { runMigrations } from './migrate.js';
import { prisma } from './db/prisma.js';
import { runSeed, syncAccessControl } from './seeds/index.js';
import { logger } from './utils/logger.js';

let preparing: Promise<void> | null = null;
let accessSynced = false;

export async function syncAccessControlOnce(): Promise<void> {
  if (accessSynced) return;
  await connectDatabase();
  await syncAccessControl();
  accessSynced = true;
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
