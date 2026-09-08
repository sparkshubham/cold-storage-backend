import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

export async function connectDatabase() {
  await prisma.$connect();
  logger.info('PostgreSQL connected');
  return prisma;
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
