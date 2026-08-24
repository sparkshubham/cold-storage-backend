import type { NextFunction, Request, Response } from 'express';
import { env } from './env.js';

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'https://cold-storage-five.vercel.app',
];

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '');
}

function extraOrigins(): string[] {
  const raw = env.CORS_ORIGINS || '';
  return raw.split(',').map(normalizeOrigin).filter(Boolean);
}

function allowedOriginSet(): Set<string> {
  return new Set([normalizeOrigin(env.CLIENT_URL), ...DEFAULT_ORIGINS, ...extraOrigins()]);
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (allowedOriginSet().has(normalized)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.protocol === 'https:' && url.hostname.endsWith('.vercel.app')) return true;
  } catch {
    return false;
  }
  return false;
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] ||
        'Content-Type, Authorization, X-Requested-With, X-Company-Id',
    );
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
