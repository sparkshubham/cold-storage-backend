/**
 * Prisma CLI wrapper: load server/.env, normalize DATABASE_URL, then run prisma.
 * Passwords with @/# must be percent-encoded for libpq.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function normalizeDatabaseUrl(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return trimmed;
  const schemeMatch = trimmed.match(/^(postgresql|postgres):\/\//i);
  if (!schemeMatch) return trimmed;
  const rest = trimmed.slice(schemeMatch[0].length);
  const at = rest.lastIndexOf('@');
  if (at <= 0) return trimmed;
  const userInfo = rest.slice(0, at);
  const hostAndPath = rest.slice(at + 1);
  const colon = userInfo.indexOf(':');
  if (colon < 0) return trimmed;
  const user = userInfo.slice(0, colon);
  const password = userInfo.slice(colon + 1);
  let decodedPassword = password;
  try {
    decodedPassword = decodeURIComponent(password);
  } catch {
    decodedPassword = password;
  }
  let url = `${schemeMatch[0]}${encodeURIComponent(user)}:${encodeURIComponent(decodedPassword)}@${hostAndPath}`;
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/|\?|$)/i.test(url);
  if (!isLocal && !/[?&]sslmode=/i.test(url)) {
    url += url.includes('?') ? '&sslmode=require' : '?sslmode=require';
  }
  return url;
}

loadDotEnv(envPath);
const raw =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  '';
if (raw) {
  process.env.DATABASE_URL = normalizeDatabaseUrl(raw);
}

const args = process.argv.slice(2);
const result = spawnSync('npx', ['prisma', ...args], {
  stdio: 'inherit',
  shell: true,
  cwd: root,
  env: process.env,
});
process.exit(result.status ?? 1);
