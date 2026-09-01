import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { runMigrations } from '../migrate.js';
import { logger } from '../utils/logger.js';
async function main() {
    await connectDatabase();
    await runMigrations();
    await disconnectDatabase();
}
main().catch(async (err) => {
    logger.error({ err }, 'Migration failed');
    await disconnectDatabase();
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map