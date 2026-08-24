import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { COMPANY_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin } from './plugins.js';

const addressSchema = new Schema(
  {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
  },
  { _id: false },
);

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    legalName: { type: String, default: '', trim: true },
    ownerName: { type: String, default: '', trim: true },
    mobile: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    gstin: { type: String, default: '', uppercase: true, trim: true },
    pan: { type: String, default: '', uppercase: true, trim: true },
    address: { type: addressSchema, default: () => ({}) },
    logoUrl: { type: String, default: '' },
    storageCapacity: { type: Number, default: 0 },
    capacityUnit: { type: String, default: 'MT' },
    chamberCount: { type: Number, default: 0 },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', default: null },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', default: null },
    status: { type: String, enum: COMPANY_STATUSES, default: 'trial', index: true },
    onboardingCompleted: { type: Boolean, default: false },
    onboardingStep: { type: Number, default: 1 },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

companySchema.plugin(softDeletePlugin);
companySchema.plugin(actorPlugin);

companySchema.index({ email: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
companySchema.index({ name: 1, deletedAt: 1 });
companySchema.index({ status: 1, createdAt: -1 });

export type Company = InferSchemaType<typeof companySchema> & { _id: mongoose.Types.ObjectId };
export const CompanyModel = mongoose.model('Company', companySchema);
