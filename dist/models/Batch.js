import mongoose, { Schema } from 'mongoose';
import { actorPlugin, softDeletePlugin, tenantPlugin } from './plugins.js';
const batchSchema = new Schema({
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true },
    lotNumber: { type: String, default: '', trim: true, uppercase: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    quantity: { type: Number, required: true, min: 0 },
    inwardDate: { type: Date, required: true },
    manufacturingDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    chamberId: { type: Schema.Types.ObjectId, ref: 'Chamber', default: null },
    rackId: { type: Schema.Types.ObjectId, ref: 'Rack', default: null },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    status: { type: String, default: 'available', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
batchSchema.plugin(tenantPlugin, true);
batchSchema.plugin(softDeletePlugin);
batchSchema.plugin(actorPlugin);
batchSchema.index({ companyId: 1, batchNumber: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
export const BatchModel = mongoose.model('Batch', batchSchema);
//# sourceMappingURL=Batch.js.map