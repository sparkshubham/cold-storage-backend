import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { MASTER_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin, tenantPlugin } from './plugins.js';

const customerSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    businessName: { type: String, default: '', trim: true },
    mobile: { type: String, required: true, trim: true },
    alternateMobile: { type: String, default: '', trim: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    gstin: { type: String, default: '', uppercase: true, trim: true },
    pan: { type: String, default: '', uppercase: true, trim: true },
    openingBalance: { type: Number, default: 0 },
    creditLimit: { type: Number, default: 0 },
    paymentTerms: { type: String, default: '' },
    notes: { type: String, default: '' },
    status: { type: String, enum: MASTER_STATUSES, default: 'active', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

customerSchema.plugin(tenantPlugin, true);
customerSchema.plugin(softDeletePlugin);
customerSchema.plugin(actorPlugin);
customerSchema.index({ companyId: 1, code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
customerSchema.index({ companyId: 1, mobile: 1 });
customerSchema.index({ companyId: 1, name: 1 });

export type Customer = InferSchemaType<typeof customerSchema> & { _id: mongoose.Types.ObjectId };
export const CustomerModel = mongoose.model('Customer', customerSchema);
