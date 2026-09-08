import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { runSeed } from './index.js';
import { logger } from '../utils/logger.js';

async function main() {
  const force = process.argv.includes('--force') || process.env.SEED_FORCE === '1';
  await connectDatabase();
  await runSeed({ force });
  await disconnectDatabase();
}

main().catch(async (err) => {
  logger.error({ err }, 'Seed failed');
  await disconnectDatabase();
  process.exit(1);
});
