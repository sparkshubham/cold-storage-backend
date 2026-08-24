import { SubscriptionModel } from '../models/Subscription.js';
import { PlanModel } from '../models/Plan.js';
import { CompanyModel } from '../models/Company.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import type { AuthUser } from '../types/auth.js';

export async function createSubscription(
  input: {
    companyId: string;
    planId: string;
    status?: string;
    startDate: Date;
    endDate: Date;
    amount?: number;
    notes?: string;
  },
  actor: AuthUser,
) {
  const [company, plan] = await Promise.all([
    CompanyModel.findOne({ _id: input.companyId, deletedAt: null }),
    PlanModel.findOne({ _id: input.planId, deletedAt: null }),
  ]);
  if (!company) {
    throw AppError.notFound('Company not found');
  }
  if (!plan) {
    throw AppError.notFound('Plan not found');
  }

  const subscription = await SubscriptionModel.create({
    ...input,
    amount: input.amount ?? plan.price,
    status: input.status ?? 'active',
    createdBy: actor.id,
  });

  company.planId = plan._id;
  company.subscriptionId = subscription._id;
  company.status = subscription.status === 'active' ? 'active' : company.status;
  await company.save();

  await writeAudit({
    companyId: input.companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Subscription',
    recordId: String(subscription._id),
    recordLabel: `${company.name} / ${plan.name}`,
  });

  return subscription;
}

export async function listSubscriptions(params: {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: 1 | -1;
  status?: string;
  companyId?: string;
}) {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (params.status) filter.status = params.status;
  if (params.companyId) filter.companyId = params.companyId;

  const [data, total] = await Promise.all([
    SubscriptionModel.find(filter)
      .populate('companyId', 'name email status')
      .populate('planId', 'name code price billingCycle')
      .sort({ [params.sortBy]: params.sortOrder })
      .skip(params.skip)
      .limit(params.limit),
    SubscriptionModel.countDocuments(filter),
  ]);
  return { data, total };
}

export async function updateSubscriptionStatus(
  id: string,
  status: 'active' | 'expired' | 'suspended' | 'cancelled',
  actor: AuthUser,
) {
  const subscription = await SubscriptionModel.findOne({ _id: id, deletedAt: null });
  if (!subscription) {
    throw AppError.notFound('Subscription not found');
  }
  subscription.status = status;
  if (status === 'cancelled') {
    subscription.cancelledAt = new Date();
  }
  subscription.updatedBy = actor.id as unknown as typeof subscription.updatedBy;
  await subscription.save();

  if (status === 'cancelled' || status === 'suspended') {
    await CompanyModel.updateOne({ _id: subscription.companyId }, { $set: { status: 'suspended' } });
  }
  if (status === 'active') {
    await CompanyModel.updateOne({ _id: subscription.companyId }, { $set: { status: 'active' } });
  }

  await writeAudit({
    companyId: String(subscription.companyId),
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Subscription',
    recordId: id,
    newValue: { status },
  });
  return subscription;
}
