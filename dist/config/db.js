import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
mongoose.set('strictQuery', true);
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const LOCAL_HOST = /localhost|127\.0\.0\.1/;
function mongoHost(uri) {
    return uri.replace(/^mongodb(\+srv)?:\/\/([^@]+@)?/, '').split('/')[0].split('?')[0] || '(unknown)';
}
function isLocalMongoUri(uri) {
    return LOCAL_HOST.test(uri);
}
function ensureDatabaseName(uri) {
    const [withoutQuery, query] = uri.split('?');
    const path = withoutQuery.replace(/^mongodb(\+srv)?:\/\/[^/]+/, '');
    if (path && path !== '/')
        return uri;
    const suffix = query ? `?${query}` : '';
    return `${withoutQuery.replace(/\/$/, '')}/coldflow${suffix}`;
}
function resolveMongoUri() {
    const uri = env.MONGODB_URI.trim();
    const onVercel = Boolean(process.env.VERCEL);
    if (!uri || (onVercel && isLocalMongoUri(uri))) {
        throw new Error('MONGODB_URI is missing or still points at localhost. In Vercel → Project → Settings → Environment Variables, set MONGODB_URI to your MongoDB Atlas connection string.');
    }
    return ensureDatabaseName(uri);
}
let connecting = null;
async function openConnection() {
    const uri = resolveMongoUri();
    logger.info({ host: mongoHost(uri) }, 'Connecting to MongoDB');
    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 20000,
        maxPoolSize: 10,
        minPoolSize: 0,
        maxIdleTimeMS: 10000,
        family: 4,
    });
    logger.info({ host: mongoHost(uri) }, 'MongoDB connected');
}
export async function connectDatabase() {
    if (mongoose.connection.readyState === 1)
        return;
    if (!connecting) {
        connecting = openConnection().catch((err) => {
            connecting = null;
            throw err;
        });
    }
    await connecting;
}
export async function disconnectDatabase() {
    connecting = null;
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
}
//# sourceMappingURL=db.js.map