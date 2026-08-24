import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const LOCAL_HOST = /localhost|127\.0\.0\.1/;

function mongoHost(uri: string): string {
  return uri.replace(/^mongodb(\+srv)?:\/\/([^@]+@)?/, '').split('/')[0].split('?')[0] || '(unknown)';
}

function isLocalMongoUri(uri: string): boolean {
  return LOCAL_HOST.test(uri);
}

function ensureDatabaseName(uri: string): string {
  const [withoutQuery, query] = uri.split('?');
  const path = withoutQuery.replace(/^mongodb(\+srv)?:\/\/[^/]+/, '');
  if (path && path !== '/') return uri;
  const suffix = query ? `?${query}` : '';
  return `${withoutQuery.replace(/\/$/, '')}/coldflow${suffix}`;
}

function resolveMongoUri(): string {
  const uri = env.MONGODB_URI.trim();
  const onVercel = Boolean(process.env.VERCEL);

  if (!uri || (onVercel && isLocalMongoUri(uri))) {
    throw new Error(
      'MONGODB_URI is missing or still points at localhost. In Vercel → Project → Settings → Environment Variables, set MONGODB_URI to your MongoDB Atlas connection string.',
    );
  }

  return ensureDatabaseName(uri);
}

let connecting: Promise<void> | null = null;

async function openConnection(): Promise<void> {
  const uri = resolveMongoUri();
  mongoose.set('strictQuery', true);

  logger.info({ host: mongoHost(uri) }, 'Connecting to MongoDB');

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 5,
    minPoolSize: 0,
    family: 4,
  });

  logger.info({ host: mongoHost(uri) }, 'MongoDB connected');
}

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  if (!connecting) {
    connecting = openConnection().catch((err) => {
      connecting = null;
      throw err;
    });
  }

  await connecting;
}

export async function disconnectDatabase(): Promise<void> {
  connecting = null;
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}
