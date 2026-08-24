import express, { type RequestHandler } from 'express';
import helmetImport from 'helmet';
import { createRequire } from 'node:module';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import { corsMiddleware } from './config/cors.js';
import { connectDatabase } from './config/db.js';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { AppError } from './utils/AppError.js';
import { logger } from './utils/logger.js';

function resolveCallable(mod: unknown): ((options?: Record<string, unknown>) => RequestHandler) | null {
  let current: unknown = mod;
  for (let i = 0; i < 4; i += 1) {
    if (typeof current === 'function') {
      return current as (options?: Record<string, unknown>) => RequestHandler;
    }
    if (current && typeof current === 'object' && 'default' in current) {
      current = (current as { default: unknown }).default;
      continue;
    }
    break;
  }
  return null;
}

function loadHelmet(): ((options?: Record<string, unknown>) => RequestHandler) | null {
  const fromImport = resolveCallable(helmetImport);
  if (fromImport) return fromImport;
  try {
    return resolveCallable(createRequire(import.meta.url)('helmet'));
  } catch {
    return null;
  }
}

const helmet = loadHelmet();

async function ensureDatabase(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (req.method === 'OPTIONS' || req.path === '/' || req.path === '/health') {
    next();
    return;
  }
  try {
    await connectDatabase();
    next();
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed');
    next(new AppError('Database unavailable', 503));
  }
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(corsMiddleware);
  if (helmet) {
    app.use(
      helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        contentSecurityPolicy: false,
      }),
    );
  }
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(ensureDatabase);
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.method === 'OPTIONS',
      message: { success: false, message: 'Too many requests' },
    }),
  );

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      service: 'coldflow-api',
      health: '/health',
      api: env.API_PREFIX,
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', service: 'coldflow-api' } });
  });

  app.use(env.API_PREFIX, createApiRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
