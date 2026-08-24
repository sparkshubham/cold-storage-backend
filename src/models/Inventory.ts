import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { INVENTORY_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin, tenantPlugin } from './plugins.js';

const inventorySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    chamberId: { type: Schema.Types.ObjectId, ref: 'Chamber', required: true, index: true },
    rackId: { type: Schema.Types.ObjectId, ref: 'Rack', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, required: true, trim: true },
    status: { type: String, enum: INVENTORY_STATUSES, default: 'available', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

inventorySchema.plugin(tenantPlugin, true);
inventorySchema.plugin(softDeletePlugin);
inventorySchema.plugin(actorPlugin);
inventorySchema.index({
  companyId: 1,
  customerId: 1,
  productId: 1,
  batchId: 1,
  locationId: 1,
  status: 1,
});

export type Inventory = InferSchemaType<typeof inventorySchema> & { _id: mongoose.Types.ObjectId };
export const InventoryModel = mongoose.model('Inventory', inventorySchema);
