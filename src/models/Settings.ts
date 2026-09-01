import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const settingsSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null, unique: true },
    scope: { type: String, enum: ['platform', 'company'], required: true },
    invoicePrefix: { type: String, default: 'INV' },
    inwardPrefix: { type: String, default: 'INW' },
    outwardPrefix: { type: String, default: 'OUT' },
    paymentPrefix: { type: String, default: 'PAY' },
    gatePassPrefix: { type: String, default: 'GP' },
    transferPrefix: { type: String, default: 'TRF' },
    adjustmentPrefix: { type: String, default: 'ADJ' },
    defaultGstRate: { type: Number, default: 18 },
    storageRatePerUnitPerDay: { type: Number, default: 20 },
    inwardHandlingRate: { type: Number, default: 40 },
    outwardHandlingRate: { type: Number, default: 40 },
    dateFormat: { type: String, default: 'DD-MM-YYYY' },
    currency: { type: String, default: 'INR' },
    currencySymbol: { type: String, default: '₹' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    values: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export type Settings = InferSchemaType<typeof settingsSchema> & { _id: mongoose.Types.ObjectId };
export const SettingsModel = mongoose.model('Settings', settingsSchema);
