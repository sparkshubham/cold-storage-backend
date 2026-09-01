import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { runMigrations } from './migrate.js';
import { UserModel } from './models/User.js';
import { runSeed } from './seeds/index.js';
import { logger } from './utils/logger.js';
let preparing = null;
export async function prepareDatabase() {
    if (!preparing) {
        preparing = (async () => {
            await connectDatabase();
            const seeded = await UserModel.exists({
                email: env.SEED_SUPER_ADMIN_EMAIL.toLowerCase(),
                deletedAt: null,
            });
            if (seeded) {
                logger.info('Database already seeded');
                return;
            }
            await runSeed();
            try {
                await runMigrations();
            }
            catch (err) {
                logger.error({ err }, 'Migration failed after seed; login accounts are still available');
            }
        })().catch((err) => {
            preparing = null;
            throw err;
        });
    }
    await preparing;
}
//# sourceMappingURL=bootstrap.js.map