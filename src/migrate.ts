import mongoose, { Schema } from 'mongoose';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { registeredModels } from './models/register.js';
import { logger } from './utils/logger.js';
import { isMainModule } from './utils/isMain.js';

const migrationSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    appliedAt: { type: Date, required: true },
  },
  { timestamps: false, collection: 'migrations' },
);

const MigrationModel = mongoose.models.Migration || mongoose.model('Migration', migrationSchema);

async function syncAllIndexes() {
  for (const model of registeredModels) {
    try {
      await model.syncIndexes();
      logger.info({ collection: model.collection.name }, 'Indexes synced');
    } catch (err) {
      logger.error({ err, collection: model.collection.name }, 'Index sync failed');
      throw err;
    }
  }
}

export async function runMigrations() {
  await syncAllIndexes();
  await MigrationModel.updateOne(
    { name: '001_sync_indexes' },
    { $setOnInsert: { name: '001_sync_indexes', appliedAt: new Date() } },
    { upsert: true },
  );
  logger.info('Migrations completed');
}

async function main() {
  await connectDatabase();
  await runMigrations();
  await disconnectDatabase();
}

if (isMainModule(import.meta.url)) {
  main().catch(async (err) => {
    logger.error({ err }, 'Migration failed');
    await disconnectDatabase();
    process.exit(1);
  });
}
