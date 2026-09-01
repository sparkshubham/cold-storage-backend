import { disconnectDatabase } from '../config/db.js';
import { prepareDatabase } from '../bootstrap.js';
import { logger } from '../utils/logger.js';
async function main() {
    await prepareDatabase();
    logger.info('Database prepared (seed + migrate)');
    await disconnectDatabase();
}
main().catch(async (err) => {
    logger.error({ err }, 'Database prepare failed');
    await disconnectDatabase();
    if (process.env.VERCEL) {
        logger.warn('Vercel build continues without seed/migrate');
        process.exit(0);
    }
    process.exit(1);
});
//# sourceMappingURL=prepareDb.js.map