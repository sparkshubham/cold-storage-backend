import { PlanModel } from '../models/Plan.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { escapeRegex } from '../utils/pagination.js';
import type { AuthUser } from '../types/auth.js';

export async function createPlan(input: Record<string, unknown>, actor: AuthUser) {
  const code = String(input.code).toUpperCase();
  const existing = await PlanModel.findOne({ code, deletedAt: null });
  if (existing) {
    throw AppError.conflict('Plan code already exists');
  }
  const plan = await PlanModel.create({ ...input, code, createdBy: actor.id });
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Plan',
    recordId: String(plan._id),
    recordLabel: plan.name,
  });
  return plan;
}

export async function listPlans(params: {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: 1 | -1;
  search: string;
}) {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  const [data, total] = await Promise.all([
    PlanModel.find(filter)
      .sort({ [params.sortBy]: params.sortOrder })
      .skip(params.skip)
      .limit(params.limit),
    PlanModel.countDocuments(filter),
  ]);
  return { data, total };
}

export async function getPlan(id: string) {
  const plan = await PlanModel.findOne({ _id: id, deletedAt: null });
  if (!plan) {
    throw AppError.notFound('Plan not found');
  }
  return plan;
}

export async function updatePlan(id: string, input: Record<string, unknown>, actor: AuthUser) {
  const plan = await PlanModel.findOne({ _id: id, deletedAt: null });
  if (!plan) {
    throw AppError.notFound('Plan not found');
  }
  if (input.code) {
    input.code = String(input.code).toUpperCase();
  }
  Object.assign(plan, input, { updatedBy: actor.id });
  await plan.save();
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Plan',
    recordId: id,
    recordLabel: plan.name,
  });
  return plan;
}

export async function softDeletePlan(id: string, actor: AuthUser) {
  const plan = await PlanModel.findOne({ _id: id, deletedAt: null });
  if (!plan) {
    throw AppError.notFound('Plan not found');
  }
  plan.deletedAt = new Date();
  plan.deletedBy = actor.id as unknown as typeof plan.deletedBy;
  plan.isActive = false;
  await plan.save();
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'Plan',
    recordId: id,
    recordLabel: plan.name,
  });
  return plan;
}
