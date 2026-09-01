import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { runSeed } from './index.js';
import { logger } from '../utils/logger.js';
async function main() {
    await connectDatabase();
    await runSeed();
    await disconnectDatabase();
}
main().catch(async (err) => {
    logger.error({ err }, 'Seed failed');
    await disconnectDatabase();
    process.exit(1);
});
//# sourceMappingURL=cli.js.map