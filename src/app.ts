import express, { type RequestHandler } from 'express';
import cors from 'cors';
import helmetImport from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

function middlewareFactory(mod: unknown): () => RequestHandler {
  const fn = typeof mod === 'function' ? mod : (mod as { default: unknown }).default;
  if (typeof fn !== 'function') {
    throw new TypeError('Expected a callable middleware factory');
  }
  return fn as () => RequestHandler;
}

const helmet = middlewareFactory(helmetImport);

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests' },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', service: 'coldflow-api' } });
  });

  app.use(env.API_PREFIX, createApiRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
