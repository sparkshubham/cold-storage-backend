import './loadEnv.js';
import { z } from 'zod';

function pickEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim() !== '') return value;
  }
  return undefined;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('https://cold-storage-five.vercel.app'),
  CORS_ORIGINS: z.string().default('https://cold-storage-five.vercel.app'),
  API_PREFIX: z.string().default('/api/v1'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/coldflow'),
  JWT_ACCESS_SECRET: z.string().min(32).default('change-me-access-secret-min-32-chars!!'),
  JWT_REFRESH_SECRET: z.string().min(32).default('change-me-refresh-secret-min-32-chars!!'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),
  SEED_SUPER_ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse({
    ...process.env,
    CLIENT_URL: pickEnv('CLIENT_URL', 'CLIENT_URL'),
    CORS_ORIGINS: pickEnv('CORS_ORIGINS', 'CORS_ORIGINS', 'CORS_ORIGINS'),
    API_PREFIX: pickEnv('API_PREFIX', 'API_PREFIX'),
    MONGODB_URI: pickEnv('MONGODB_URI', 'MONGODB_URI'),
    JWT_ACCESS_SECRET: pickEnv('JWT_ACCESS_SECRET', 'JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: pickEnv('JWT_REFRESH_SECRET', 'JWT_REFRESH_SECRET'),
    JWT_ACCESS_EXPIRES_IN: pickEnv('JWT_ACCESS_EXPIRES_IN', 'JWT_ACCESS_EXPIRES_IN'),
    JWT_REFRESH_EXPIRES_IN: pickEnv('JWT_REFRESH_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN'),
    BCRYPT_SALT_ROUNDS: pickEnv('BCRYPT_SALT_ROUNDS', 'BCRYPT_SALT_ROUNDS'),
    SEED_SUPER_ADMIN_EMAIL: pickEnv('SEED_SUPER_ADMIN_EMAIL', 'SEED_SUPER_ADMIN_EMAIL'),
    SEED_SUPER_ADMIN_PASSWORD: pickEnv('SEED_SUPER_ADMIN_PASSWORD', 'SEED_SUPER_ADMIN_PASSWORD'),
    LOG_LEVEL: pickEnv('LOG_LEVEL', 'LOG_LEVEL'),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
