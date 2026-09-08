import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from './logger.js';

interface AuditInput {
  companyId?: string | null;
  userId?: string | null;
  userName?: string;
  action: string;
  module: string;
  recordId?: string;
  recordLabel?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string;
  userAgent?: string;
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export async function writeAudit(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: input.companyId ?? null,
        userId: input.userId ?? null,
        userName: input.userName ?? '',
        action: input.action,
        module: input.module,
        recordId: input.recordId ?? '',
        recordLabel: input.recordLabel ?? '',
        oldValue: toJson(input.oldValue),
        newValue: toJson(input.newValue),
        ip: input.ip ?? '',
        userAgent: input.userAgent ?? '',
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log');
  }
}
