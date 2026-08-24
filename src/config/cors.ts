import type { CorsOptions } from 'cors';
import { env } from './env.js';

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '');
}

function configuredOrigins(): Set<string> {
  const extras = env.CORS_ORIGINS.split(',').map(normalizeOrigin).filter(Boolean);
  return new Set([normalizeOrigin(env.CLIENT_URL), ...extras]);
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isVercelOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return configuredOrigins().has(normalized) || isLocalDevOrigin(origin) || isVercelOrigin(origin);
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Company-Id'],
  optionsSuccessStatus: 204,
};
