import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { OUTWARD_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin, tenantPlugin } from './plugins.js';

const outwardSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    outwardNumber: { type: String, required: true, trim: true, uppercase: true },
    date: { type: Date, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    unit: { type: String, required: true, trim: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
    chamberId: { type: Schema.Types.ObjectId, ref: 'Chamber', required: true },
    rackId: { type: Schema.Types.ObjectId, ref: 'Rack', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    vehicleNumber: { type: String, default: '' },
    notes: { type: String, default: '' },
    status: { type: String, enum: OUTWARD_STATUSES, default: 'completed', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

outwardSchema.plugin(tenantPlugin, true);
outwardSchema.plugin(softDeletePlugin);
outwardSchema.plugin(actorPlugin);
outwardSchema.index({ companyId: 1, outwardNumber: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export type Outward = InferSchemaType<typeof outwardSchema> & { _id: mongoose.Types.ObjectId };
export const OutwardModel = mongoose.model('Outward', outwardSchema);
