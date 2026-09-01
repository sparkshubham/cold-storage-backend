import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { INVOICE_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin, tenantPlugin } from './plugins.js';

const invoiceItemSchema = new Schema(
  {
    description: { type: String, required: true },
    hsn: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, default: '' },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    invoiceNumber: { type: String, required: true, trim: true, uppercase: true },
    date: { type: Date, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    sourceType: { type: String, enum: ['inward', 'outward'], required: true, index: true },
    sourceId: { type: Schema.Types.ObjectId, required: true, index: true },
    inwardId: { type: Schema.Types.ObjectId, ref: 'Inward', default: null },
    outwardId: { type: Schema.Types.ObjectId, ref: 'Outward', default: null },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    storageFrom: { type: Date, default: null },
    storageTo: { type: Date, default: null },
    storageDays: { type: Number, default: 0 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, default: '' },
    items: { type: [invoiceItemSchema], default: [] },
    subtotal: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true, min: 0 },
    gstAmount: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    notes: { type: String, default: '' },
    status: { type: String, enum: INVOICE_STATUSES, default: 'issued', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

invoiceSchema.plugin(tenantPlugin, true);
invoiceSchema.plugin(softDeletePlugin);
invoiceSchema.plugin(actorPlugin);
invoiceSchema.index({ companyId: 1, invoiceNumber: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
invoiceSchema.index({ companyId: 1, sourceType: 1, sourceId: 1, status: 1 });

export type Invoice = InferSchemaType<typeof invoiceSchema> & { _id: mongoose.Types.ObjectId };
export const InvoiceModel = mongoose.model('Invoice', invoiceSchema);
