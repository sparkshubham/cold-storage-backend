import mongoose, { Schema } from 'mongoose';
import { MASTER_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin, tenantPlugin } from './plugins.js';
const supplierSchema = new Schema({
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    businessName: { type: String, default: '', trim: true },
    mobile: { type: String, required: true, trim: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    gstin: { type: String, default: '', uppercase: true, trim: true },
    address: { type: String, default: '' },
    openingBalance: { type: Number, default: 0 },
    status: { type: String, enum: MASTER_STATUSES, default: 'active', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
supplierSchema.plugin(tenantPlugin, true);
supplierSchema.plugin(softDeletePlugin);
supplierSchema.plugin(actorPlugin);
supplierSchema.index({ companyId: 1, code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
export const SupplierModel = mongoose.model('Supplier', supplierSchema);
//# sourceMappingURL=Supplier.js.map