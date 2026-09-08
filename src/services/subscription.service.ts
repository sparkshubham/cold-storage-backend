import { prisma } from '../db/prisma.js';
import { notDeleted, orderField, serialize, withPopulated } from '../db/serialize.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { withTransaction } from '../utils/transaction.js';
import type { AuthUser } from '../types/auth.js';

const subPopulateMap = { company: 'companyId', plan: 'planId' };

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
    prisma.company.findFirst({ where: notDeleted({ id: input.companyId }) }),
    prisma.plan.findFirst({ where: notDeleted({ id: input.planId }) }),
  ]);
  if (!company) {
    throw AppError.notFound('Company not found');
  }
  if (!plan) {
    throw AppError.notFound('Plan not found');
  }

  const subscription = await withTransaction(async (tx) => {
    const created = await tx.subscription.create({
      data: {
        companyId: input.companyId,
        planId: input.planId,
        startDate: input.startDate,
        endDate: input.endDate,
        amount: input.amount ?? plan.price,
        status: input.status ?? 'active',
        notes: input.notes ?? '',
        createdBy: actor.id,
      },
    });
    await tx.company.update({
      where: { id: input.companyId },
      data: {
        planId: plan.id,
        subscriptionId: created.id,
        status: created.status === 'active' ? 'active' : company.status,
      },
    });
    return created;
  });

  await writeAudit({
    companyId: input.companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Subscription',
    recordId: subscription.id,
    recordLabel: `${company.name} / ${plan.name}`,
  });

  return serialize(subscription);
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
  const where: Record<string, unknown> = notDeleted({});
  if (params.status) where.status = params.status;
  if (params.companyId) where.companyId = params.companyId;

  const orderBy = { [orderField(params.sortBy)]: params.sortOrder === -1 ? 'desc' : 'asc' };
  const [rows, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy,
      skip: params.skip,
      take: params.limit,
      include: {
        company: { select: { id: true, name: true, email: true, status: true } },
        plan: { select: { id: true, name: true, code: true, price: true, billingCycle: true } },
      },
    }),
    prisma.subscription.count({ where }),
  ]);
  return {
    data: (rows as Record<string, unknown>[]).map((row) => withPopulated(row, subPopulateMap)),
    total,
  };
}

export async function updateSubscriptionStatus(
  id: string,
  status: 'active' | 'expired' | 'suspended' | 'cancelled',
  actor: AuthUser,
) {
  const subscription = await prisma.subscription.findFirst({ where: notDeleted({ id }) });
  if (!subscription) {
    throw AppError.notFound('Subscription not found');
  }

  const updated = await withTransaction(async (tx) => {
    const next = await tx.subscription.update({
      where: { id },
      data: {
        status,
        cancelledAt: status === 'cancelled' ? new Date() : subscription.cancelledAt,
        updatedBy: actor.id,
      },
    });
    if (status === 'cancelled' || status === 'suspended') {
      await tx.company.update({
        where: { id: subscription.companyId },
        data: { status: 'suspended' },
      });
    }
    if (status === 'active') {
      await tx.company.update({
        where: { id: subscription.companyId },
        data: { status: 'active' },
      });
    }
    return next;
  });

  await writeAudit({
    companyId: subscription.companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Subscription',
    recordId: id,
    newValue: { status },
  });
  return serialize(updated);
}
