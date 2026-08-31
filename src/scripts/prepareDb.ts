import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { runMigrations } from '../migrate.js';
import { runSeed } from '../seeds/index.js';
import { logger } from '../utils/logger.js';
import { isMainModule } from '../utils/isMain.js';

let preparing: Promise<void> | null = null;

export async function prepareDatabase(): Promise<void> {
  if (!preparing) {
    preparing = (async () => {
      await connectDatabase();
      await runMigrations();
      await runSeed();
    })().catch((err) => {
      preparing = null;
      throw err;
    });
  }
  await preparing;
}

async function main() {
  await prepareDatabase();
  logger.info('Database prepared (migrate + seed)');
  await disconnectDatabase();
}

if (isMainModule(import.meta.url)) {
  main().catch(async (err) => {
    logger.error({ err }, 'Database prepare failed');
    await disconnectDatabase();
    process.exit(1);
  });
}
