import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { MASTER_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin, tenantPlugin } from './plugins.js';

const chamberSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 0 },
    capacityUnit: { type: String, default: 'MT' },
    temperature: { type: Number, default: null },
    minTemperature: { type: Number, default: null },
    maxTemperature: { type: Number, default: null },
    location: { type: String, default: '' },
    occupiedCapacity: { type: Number, default: 0, min: 0 },
    reservedCapacity: { type: Number, default: 0, min: 0 },
    damagedCapacity: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: MASTER_STATUSES, default: 'active', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

chamberSchema.plugin(tenantPlugin, true);
chamberSchema.plugin(softDeletePlugin);
chamberSchema.plugin(actorPlugin);
chamberSchema.index({ companyId: 1, code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export type Chamber = InferSchemaType<typeof chamberSchema> & { _id: mongoose.Types.ObjectId };
export const ChamberModel = mongoose.model('Chamber', chamberSchema);
