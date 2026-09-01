import mongoose, { Schema } from 'mongoose';
import { registeredModels } from './models/register.js';
import { logger } from './utils/logger.js';
const migrationSchema = new Schema({
    name: { type: String, required: true, unique: true },
    appliedAt: { type: Date, required: true },
}, { timestamps: false, collection: 'migrations' });
const MigrationModel = mongoose.models.Migration || mongoose.model('Migration', migrationSchema);
async function syncAllIndexes() {
    for (const model of registeredModels) {
        try {
            await model.syncIndexes();
            logger.info({ collection: model.collection.name }, 'Indexes synced');
        }
        catch (err) {
            logger.error({ err, collection: model.collection.name }, 'Index sync failed');
        }
    }
}
export async function runMigrations() {
    await syncAllIndexes();
    await MigrationModel.updateOne({ name: '001_sync_indexes' }, { $setOnInsert: { name: '001_sync_indexes', appliedAt: new Date() } }, { upsert: true });
    logger.info('Migrations completed');
}
//# sourceMappingURL=migrate.js.map