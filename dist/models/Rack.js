import mongoose, { Schema } from 'mongoose';
import { MASTER_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin, tenantPlugin } from './plugins.js';
const rackSchema = new Schema({
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    chamberId: { type: Schema.Types.ObjectId, ref: 'Chamber', required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 0 },
    occupiedCapacity: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: MASTER_STATUSES, default: 'active', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
rackSchema.plugin(tenantPlugin, true);
rackSchema.plugin(softDeletePlugin);
rackSchema.plugin(actorPlugin);
rackSchema.index({ companyId: 1, chamberId: 1, code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
export const RackModel = mongoose.model('Rack', rackSchema);
//# sourceMappingURL=Rack.js.map