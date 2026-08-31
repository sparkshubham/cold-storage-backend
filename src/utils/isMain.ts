import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const fromMeta = fileURLToPath(metaUrl).replace(/\\/g, '/').toLowerCase();
  const fromArgv = path.resolve(entry).replace(/\\/g, '/').toLowerCase();
  return fromMeta === fromArgv;
}
