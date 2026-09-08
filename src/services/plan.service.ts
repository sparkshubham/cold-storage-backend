import { prisma } from '../db/prisma.js';
import { notDeleted, orderField, serialize } from '../db/serialize.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import type { AuthUser } from '../types/auth.js';

export async function createPlan(input: Record<string, unknown>, actor: AuthUser) {
  const code = String(input.code).toUpperCase();
  const existing = await prisma.plan.findFirst({ where: notDeleted({ code }) });
  if (existing) {
    throw AppError.conflict('Plan code already exists');
  }
  const plan = await prisma.plan.create({
    data: {
      name: String(input.name ?? ''),
      code,
      price: Number(input.price ?? 0),
      billingCycle: input.billingCycle != null ? String(input.billingCycle) : undefined,
      maxUsers: input.maxUsers != null ? Number(input.maxUsers) : undefined,
      maxChambers: input.maxChambers != null ? Number(input.maxChambers) : undefined,
      maxStorage: input.maxStorage != null ? Number(input.maxStorage) : undefined,
      maxCustomers: input.maxCustomers != null ? Number(input.maxCustomers) : undefined,
      features: Array.isArray(input.features) ? input.features.map(String) : undefined,
      description: input.description != null ? String(input.description) : undefined,
      isActive: input.isActive != null ? Boolean(input.isActive) : undefined,
      createdBy: actor.id,
    },
  });
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Plan',
    recordId: plan.id,
    recordLabel: plan.name,
  });
  return serialize(plan);
}

export async function listPlans(params: {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: 1 | -1;
  search: string;
}) {
  const where: Record<string, unknown> = notDeleted({});
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { code: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  const orderBy = { [orderField(params.sortBy)]: params.sortOrder === -1 ? 'desc' : 'asc' };
  const [data, total] = await Promise.all([
    prisma.plan.findMany({ where, orderBy, skip: params.skip, take: params.limit }),
    prisma.plan.count({ where }),
  ]);
  return { data: serialize(data), total };
}

export async function getPlan(id: string) {
  const plan = await prisma.plan.findFirst({ where: notDeleted({ id }) });
  if (!plan) {
    throw AppError.notFound('Plan not found');
  }
  return serialize(plan);
}

export async function updatePlan(id: string, input: Record<string, unknown>, actor: AuthUser) {
  const plan = await prisma.plan.findFirst({ where: notDeleted({ id }) });
  if (!plan) {
    throw AppError.notFound('Plan not found');
  }
  const data: Record<string, unknown> = { ...input, updatedBy: actor.id };
  if (data.code) data.code = String(data.code).toUpperCase();
  delete data.id;
  delete data._id;
  const updated = await prisma.plan.update({ where: { id }, data });
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Plan',
    recordId: id,
    recordLabel: updated.name,
  });
  return serialize(updated);
}

export async function softDeletePlan(id: string, actor: AuthUser) {
  const plan = await prisma.plan.findFirst({ where: notDeleted({ id }) });
  if (!plan) {
    throw AppError.notFound('Plan not found');
  }
  const updated = await prisma.plan.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actor.id, isActive: false },
  });
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'Plan',
    recordId: id,
    recordLabel: plan.name,
  });
  return serialize(updated);
}
