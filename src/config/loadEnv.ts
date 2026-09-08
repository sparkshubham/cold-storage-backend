import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEnv = path.resolve(dirname, '../../.env');

// Prefer server/.env over cwd/.env so workspace root runs still pick up the API config.
dotenv.config({ path: serverEnv });
dotenv.config();
