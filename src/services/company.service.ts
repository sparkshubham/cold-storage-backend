import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { ROLE_CODES } from '../config/constants.js';
import { SYSTEM_ROLES } from '../config/roles.js';
import { prisma } from '../db/prisma.js';
import { companyAddressFields, notDeleted, orderField, serialize, withPopulated } from '../db/serialize.js';
import { DEFAULT_UNIT_RATES } from './settings.service.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { withTransaction, type DbClient } from '../utils/transaction.js';
import type { AuthUser } from '../types/auth.js';

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

const companyPopulateMap = { plan: 'planId', subscription: 'subscriptionId' };

export async function createCompanyRoles(companyId: string, actorId?: string, db: DbClient = prisma) {
  const templates = SYSTEM_ROLES.filter((r) => !r.isPlatform);
  await db.role.createMany({
    data: templates.map((role) => ({
      name: role.name,
      code: role.code,
      description: role.description,
      isSystem: true,
      permissionKeys: role.permissionKeys,
      companyId,
      createdBy: actorId ?? null,
    })),
  });
}

export async function createCompany(
  input: {
    name: string;
    legalName?: string;
    ownerName?: string;
    mobile: string;
    email: string;
    gstin?: string;
    pan?: string;
    address?: Record<string, string>;
    storageCapacity?: number;
    capacityUnit?: string;
    chamberCount?: number;
    planId?: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
    adminMobile?: string;
  },
  actor: AuthUser,
) {
  const email = input.email.toLowerCase();
  const adminEmail = input.adminEmail.toLowerCase();

  const existingCompany = await prisma.company.findFirst({ where: notDeleted({ email }) });
  if (existingCompany) {
    throw AppError.conflict('A company with this email already exists');
  }
  const existingUser = await prisma.user.findFirst({ where: notDeleted({ email: adminEmail }) });
  if (existingUser) {
    throw AppError.conflict('A user with this admin email already exists');
  }

  const plan = input.planId
    ? await prisma.plan.findFirst({ where: notDeleted({ id: input.planId }) })
    : await prisma.plan.findFirst({ where: notDeleted({ code: 'BASIC' }) });

  const company = await withTransaction(async (tx) => {
    const created = await tx.company.create({
      data: {
        name: input.name,
        legalName: input.legalName ?? '',
        ownerName: input.ownerName ?? '',
        mobile: input.mobile,
        email,
        gstin: input.gstin ?? '',
        pan: input.pan ?? '',
        ...companyAddressFields(input.address ?? {}),
        storageCapacity: input.storageCapacity ?? 0,
        capacityUnit: input.capacityUnit ?? 'MT',
        chamberCount: input.chamberCount ?? 0,
        planId: plan?.id ?? null,
        status: 'trial',
        createdBy: actor.id,
      },
    });

    if (plan) {
      const start = new Date();
      const subscription = await tx.subscription.create({
        data: {
          companyId: created.id,
          planId: plan.id,
          status: 'trial',
          startDate: start,
          endDate: addMonths(start, plan.billingCycle === 'yearly' ? 12 : 1),
          trialEndsAt: addMonths(start, 1),
          amount: plan.price,
          createdBy: actor.id,
        },
      });
      await tx.company.update({
        where: { id: created.id },
        data: { subscriptionId: subscription.id },
      });
    }

    await createCompanyRoles(created.id, actor.id, tx);

    const adminRole = await tx.role.findFirst({
      where: notDeleted({ companyId: created.id, code: ROLE_CODES.COMPANY_ADMIN }),
    });
    if (!adminRole) {
      throw AppError.badRequest('Failed to create company admin role');
    }

    await tx.user.create({
      data: {
        name: input.adminName,
        email: adminEmail,
        mobile: input.adminMobile ?? '',
        passwordHash: await bcrypt.hash(input.adminPassword, env.BCRYPT_SALT_ROUNDS),
        roleId: adminRole.id,
        roleCode: ROLE_CODES.COMPANY_ADMIN,
        companyId: created.id,
        status: 'active',
        createdBy: actor.id,
      },
    });

    await tx.settings.create({
      data: {
        companyId: created.id,
        scope: 'company',
        unitRates: DEFAULT_UNIT_RATES,
        handlingChargeBasis: 'weight',
        handlingWeightUnit: 'KG',
      },
    });

    return tx.company.findFirstOrThrow({ where: { id: created.id } });
  });

  await writeAudit({
    companyId: company.id,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Company',
    recordId: company.id,
    recordLabel: company.name,
    newValue: { name: company.name, email: company.email },
  });

  return serialize(company);
}

export async function listCompanies(params: {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: 1 | -1;
  search: string;
  status?: string;
}) {
  const where: Record<string, unknown> = notDeleted({});
  if (params.status) {
    where.status = params.status;
  }
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { email: { contains: params.search, mode: 'insensitive' } },
      { mobile: { contains: params.search, mode: 'insensitive' } },
      { gstin: { contains: params.search, mode: 'insensitive' } },
      { legalName: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const orderBy = { [orderField(params.sortBy)]: params.sortOrder === -1 ? 'desc' : 'asc' };
  const [rows, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy,
      skip: params.skip,
      take: params.limit,
      include: {
        plan: { select: { id: true, name: true, code: true, price: true, billingCycle: true } },
        subscription: { select: { id: true, status: true, startDate: true, endDate: true } },
      },
    }),
    prisma.company.count({ where }),
  ]);

  return {
    data: (rows as Record<string, unknown>[]).map((row) => withPopulated(row, companyPopulateMap)),
    total,
  };
}

export async function getCompany(id: string) {
  const company = await prisma.company.findFirst({
    where: notDeleted({ id }),
    include: {
      plan: {
        select: {
          id: true,
          name: true,
          code: true,
          price: true,
          billingCycle: true,
          maxUsers: true,
          maxChambers: true,
          maxStorage: true,
          maxCustomers: true,
          features: true,
        },
      },
      subscription: true,
    },
  });
  if (!company) {
    throw AppError.notFound('Company not found');
  }
  const [userCount, admin] = await Promise.all([
    prisma.user.count({ where: notDeleted({ companyId: id }) }),
    prisma.user.findFirst({
      where: notDeleted({ companyId: id, roleCode: ROLE_CODES.COMPANY_ADMIN }),
      select: { id: true, name: true, email: true, mobile: true, status: true, lastLoginAt: true },
    }),
  ]);
  return {
    company: withPopulated(company as unknown as Record<string, unknown>, companyPopulateMap),
    userCount,
    admin: admin ? serialize(admin) : null,
  };
}

export async function updateCompany(id: string, input: Record<string, unknown>, actor: AuthUser) {
  const company = await prisma.company.findFirst({ where: notDeleted({ id }) });
  if (!company) {
    throw AppError.notFound('Company not found');
  }
  const oldValue = { name: company.name, status: company.status };
  const data: Record<string, unknown> = { ...input, updatedBy: actor.id };
  if (data.address != null) {
    Object.assign(data, companyAddressFields(data.address));
    delete data.address;
  }
  delete data.id;
  delete data._id;
  delete data.plan;
  delete data.subscription;
  const updated = await prisma.company.update({ where: { id }, data });
  await writeAudit({
    companyId: id,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Company',
    recordId: id,
    recordLabel: updated.name,
    oldValue,
    newValue: { name: updated.name, status: updated.status },
  });
  return serialize(updated);
}

export async function setCompanyStatus(id: string, status: 'active' | 'suspended', actor: AuthUser) {
  const company = await prisma.company.findFirst({ where: notDeleted({ id }) });
  if (!company) {
    throw AppError.notFound('Company not found');
  }
  const previous = company.status;
  const updated = await prisma.company.update({
    where: { id },
    data: { status, updatedBy: actor.id },
  });
  await writeAudit({
    companyId: id,
    userId: actor.id,
    userName: actor.name,
    action: status === 'suspended' ? 'SUSPEND' : 'ACTIVATE',
    module: 'Company',
    recordId: id,
    recordLabel: updated.name,
    oldValue: { status: previous },
    newValue: { status },
  });
  return serialize(updated);
}

export async function softDeleteCompany(id: string, actor: AuthUser) {
  const company = await prisma.company.findFirst({ where: notDeleted({ id }) });
  if (!company) {
    throw AppError.notFound('Company not found');
  }
  const updated = await withTransaction(async (tx) => {
    const next = await tx.company.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actor.id, status: 'deleted' },
    });
    await tx.user.updateMany({
      where: { companyId: id, deletedAt: null },
      data: { status: 'suspended', updatedBy: actor.id },
    });
    return next;
  });
  await writeAudit({
    companyId: id,
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'Company',
    recordId: id,
    recordLabel: company.name,
  });
  return serialize(updated);
}
