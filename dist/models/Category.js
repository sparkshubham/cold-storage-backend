import mongoose, { Schema } from 'mongoose';
import { MASTER_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin, tenantPlugin } from './plugins.js';
const categorySchema = new Schema({
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, default: '' },
    status: { type: String, enum: MASTER_STATUSES, default: 'active', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
categorySchema.plugin(tenantPlugin, true);
categorySchema.plugin(softDeletePlugin);
categorySchema.plugin(actorPlugin);
categorySchema.index({ companyId: 1, code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
export const CategoryModel = mongoose.model('Category', categorySchema);
//# sourceMappingURL=Category.js.map