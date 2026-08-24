import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { MASTER_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin, tenantPlugin } from './plugins.js';

const productSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    sku: { type: String, default: '', trim: true },
    hsn: { type: String, default: '', trim: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null },
    defaultRate: { type: Number, default: 0 },
    storageType: { type: String, default: '' },
    minTemperature: { type: Number, default: null },
    maxTemperature: { type: Number, default: null },
    description: { type: String, default: '' },
    status: { type: String, enum: MASTER_STATUSES, default: 'active', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

productSchema.plugin(tenantPlugin, true);
productSchema.plugin(softDeletePlugin);
productSchema.plugin(actorPlugin);
productSchema.index({ companyId: 1, code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
productSchema.index({ companyId: 1, name: 1 });

export type Product = InferSchemaType<typeof productSchema> & { _id: mongoose.Types.ObjectId };
export const ProductModel = mongoose.model('Product', productSchema);
