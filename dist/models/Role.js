import mongoose, { Schema } from 'mongoose';
import { tenantPlugin, actorPlugin, softDeletePlugin } from './plugins.js';
const roleSchema = new Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, default: '' },
    isSystem: { type: Boolean, default: false },
    permissionKeys: { type: [String], default: [] },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
roleSchema.plugin(tenantPlugin, false);
roleSchema.plugin(softDeletePlugin);
roleSchema.plugin(actorPlugin);
roleSchema.index({ companyId: 1, code: 1 }, { unique: true });
export const RoleModel = mongoose.model('Role', roleSchema);
//# sourceMappingURL=Role.js.map