import mongoose, { Schema } from 'mongoose';
import { BILLING_CYCLES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin } from './plugins.js';
const planSchema = new Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    billingCycle: { type: String, enum: BILLING_CYCLES, default: 'monthly' },
    maxUsers: { type: Number, default: 10 },
    maxChambers: { type: Number, default: 5 },
    maxStorage: { type: Number, default: 1000 },
    maxCustomers: { type: Number, default: 100 },
    features: { type: [String], default: [] },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
planSchema.plugin(softDeletePlugin);
planSchema.plugin(actorPlugin);
export const PlanModel = mongoose.model('Plan', planSchema);
//# sourceMappingURL=Plan.js.map