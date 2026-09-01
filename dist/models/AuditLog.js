import mongoose, { Schema } from 'mongoose';
const auditLogSchema = new Schema({
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userName: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    module: { type: String, required: true, index: true },
    recordId: { type: String, default: '' },
    recordLabel: { type: String, default: '' },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
}, { timestamps: true });
auditLogSchema.index({ companyId: 1, createdAt: -1 });
auditLogSchema.index({ module: 1, action: 1, createdAt: -1 });
export const AuditLogModel = mongoose.model('AuditLog', auditLogSchema);
//# sourceMappingURL=AuditLog.js.map