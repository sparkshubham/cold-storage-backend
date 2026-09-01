import './config/loadEnv.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/db.js';
import app from './app.js';
import { logger } from './utils/logger.js';

async function main() {
  if (process.env.VERCEL) {
    return;
  }

  await connectDatabase();
  const { prepareDatabase } = await import('./bootstrap.js');
  await prepareDatabase();
  app.listen(env.PORT, () => {
    logger.info(`ColdFlow API listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

export default app;
