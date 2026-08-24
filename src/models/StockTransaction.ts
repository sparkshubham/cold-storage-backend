import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { STOCK_TXN_TYPES } from '../config/constants.js';
import { actorPlugin, tenantPlugin } from './plugins.js';

const stockTransactionSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    type: { type: String, enum: STOCK_TXN_TYPES, required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
    chamberId: { type: Schema.Types.ObjectId, ref: 'Chamber', default: null },
    rackId: { type: Schema.Types.ObjectId, ref: 'Rack', default: null },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true, trim: true },
    referenceType: { type: String, default: '' },
    referenceId: { type: Schema.Types.ObjectId, default: null },
    referenceNumber: { type: String, default: '' },
    notes: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

stockTransactionSchema.plugin(tenantPlugin, true);
stockTransactionSchema.plugin(actorPlugin);
stockTransactionSchema.index({ companyId: 1, createdAt: -1 });
stockTransactionSchema.index({ companyId: 1, productId: 1, createdAt: -1 });

export type StockTransaction = InferSchemaType<typeof stockTransactionSchema> & { _id: mongoose.Types.ObjectId };
export const StockTransactionModel = mongoose.model('StockTransaction', stockTransactionSchema);
