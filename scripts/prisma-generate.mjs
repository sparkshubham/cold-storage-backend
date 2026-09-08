process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { spawnSync } from 'node:child_process';
const result = spawnSync('npx', ['prisma', 'generate'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
