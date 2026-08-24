import { AuditLogModel } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

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

export async function writeAudit(input: AuditInput) {
  try {
    await AuditLogModel.create({
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      userName: input.userName ?? '',
      action: input.action,
      module: input.module,
      recordId: input.recordId ?? '',
      recordLabel: input.recordLabel ?? '',
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      ip: input.ip ?? '',
      userAgent: input.userAgent ?? '',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log');
  }
}
