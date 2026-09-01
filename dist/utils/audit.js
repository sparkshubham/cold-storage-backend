import { AuditLogModel } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';
export async function writeAudit(input) {
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
    }
    catch (err) {
        logger.error({ err }, 'Failed to write audit log');
    }
}
//# sourceMappingURL=audit.js.map