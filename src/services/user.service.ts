import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { ROLE_CODES } from '../config/constants.js';
import { prisma } from '../db/prisma.js';
import { notDeleted, orderField, serialize, withPopulated } from '../db/serialize.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import type { AuthUser } from '../types/auth.js';

const userPopulateMap = { role: 'roleId', company: 'companyId' };

export async function listUsers(
  params: {
    page: number;
    limit: number;
    skip: number;
    sortBy: string;
    sortOrder: 1 | -1;
    search: string;
    companyId?: string | null;
    status?: string;
  },
  actor: AuthUser,
) {
  const where: Record<string, unknown> = notDeleted({});
  if (!actor.isSuperAdmin) {
    where.companyId = actor.companyId;
  } else if (params.companyId) {
    where.companyId = params.companyId;
  }
  if (params.status) {
    where.status = params.status;
  }
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { email: { contains: params.search, mode: 'insensitive' } },
      { mobile: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const orderBy = { [orderField(params.sortBy)]: params.sortOrder === -1 ? 'desc' : 'asc' };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip: params.skip,
      take: params.limit,
      include: {
        role: { select: { id: true, name: true, code: true } },
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return {
    data: (rows as Record<string, unknown>[]).map((row) => withPopulated(row, userPopulateMap)),
    total,
  };
}

export async function createUser(
  input: {
    name: string;
    email: string;
    mobile?: string;
    password: string;
    roleId: string;
    companyId?: string;
    status?: 'active' | 'suspended' | 'pending';
  },
  actor: AuthUser,
) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findFirst({ where: notDeleted({ email }) });
  if (existing) {
    throw AppError.conflict('A user with this email already exists');
  }

  const role = await prisma.role.findFirst({ where: notDeleted({ id: input.roleId }) });
  if (!role) {
    throw AppError.notFound('Role not found');
  }
  if (role.code === ROLE_CODES.SUPER_ADMIN && !actor.isSuperAdmin) {
    throw AppError.forbidden('Cannot assign super admin role');
  }

  const companyId = actor.isSuperAdmin ? input.companyId ?? null : actor.companyId;
  if (role.code !== ROLE_CODES.SUPER_ADMIN && !companyId) {
    throw AppError.badRequest('Company is required for this role');
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email,
      mobile: input.mobile ?? '',
      passwordHash: await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS),
      roleId: role.id,
      roleCode: role.code,
      companyId,
      status: input.status ?? 'active',
      createdBy: actor.id,
    },
  });

  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'User',
    recordId: user.id,
    recordLabel: user.name,
  });

  return serialize(user);
}

export async function updateUser(id: string, input: Record<string, unknown>, actor: AuthUser) {
  const user = await prisma.user.findFirst({ where: notDeleted({ id }) });
  if (!user) {
    throw AppError.notFound('User not found');
  }
  if (!actor.isSuperAdmin && user.companyId !== actor.companyId) {
    throw AppError.forbidden();
  }

  const data: Record<string, unknown> = { updatedBy: actor.id };
  if (input.roleId) {
    const role = await prisma.role.findFirst({ where: notDeleted({ id: String(input.roleId) }) });
    if (!role) {
      throw AppError.notFound('Role not found');
    }
    data.roleId = role.id;
    data.roleCode = role.code;
  }
  if (input.name) data.name = String(input.name);
  if (input.mobile !== undefined) data.mobile = String(input.mobile);
  if (input.status) data.status = String(input.status);

  const updated = await prisma.user.update({ where: { id }, data });
  await writeAudit({
    companyId: updated.companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'User',
    recordId: id,
    recordLabel: updated.name,
  });
  return serialize(updated);
}

export async function softDeleteUser(id: string, actor: AuthUser) {
  const user = await prisma.user.findFirst({ where: notDeleted({ id }) });
  if (!user) {
    throw AppError.notFound('User not found');
  }
  if (user.id === actor.id) {
    throw AppError.badRequest('You cannot delete your own account');
  }
  if (!actor.isSuperAdmin && user.companyId !== actor.companyId) {
    throw AppError.forbidden();
  }
  const updated = await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actor.id, status: 'suspended' },
  });
  await writeAudit({
    companyId: user.companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'User',
    recordId: id,
    recordLabel: user.name,
  });
  return serialize(updated);
}

export async function listRoles(companyId: string | null, actor: AuthUser) {
  const where: Record<string, unknown> = notDeleted({});
  if (actor.isSuperAdmin) {
    if (companyId) {
      where.OR = [{ companyId }, { companyId: null }];
    }
  } else {
    where.companyId = actor.companyId;
  }
  const roles = await prisma.role.findMany({ where, orderBy: { name: 'asc' } });
  return serialize(roles);
}

export async function listAuditLogs(params: {
  page: number;
  limit: number;
  skip: number;
  companyId?: string | null;
  module?: string;
  action?: string;
  actor: AuthUser;
}) {
  const where: Record<string, unknown> = {};
  if (!params.actor.isSuperAdmin) {
    where.companyId = params.actor.companyId;
  } else if (params.companyId) {
    where.companyId = params.companyId;
  }
  if (params.module) where.module = params.module;
  if (params.action) where.action = params.action;

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { data: serialize(data), total };
}
