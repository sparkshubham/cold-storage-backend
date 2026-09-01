import mongoose, { Schema } from 'mongoose';
import { SUBSCRIPTION_STATUSES } from '../config/constants.js';
import { actorPlugin, softDeletePlugin } from './plugins.js';
const subscriptionSchema = new Schema({
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'trial', index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    trialEndsAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    amount: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
subscriptionSchema.plugin(softDeletePlugin);
subscriptionSchema.plugin(actorPlugin);
subscriptionSchema.index({ companyId: 1, status: 1 });
subscriptionSchema.index({ endDate: 1, status: 1 });
export const SubscriptionModel = mongoose.model('Subscription', subscriptionSchema);
//# sourceMappingURL=Subscription.js.map