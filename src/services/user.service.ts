import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { ROLE_CODES } from '../config/constants.js';
import { UserModel } from '../models/User.js';
import { RoleModel } from '../models/Role.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { escapeRegex } from '../utils/pagination.js';
import type { AuthUser } from '../types/auth.js';

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
  const filter: Record<string, unknown> = { deletedAt: null };
  if (!actor.isSuperAdmin) {
    filter.companyId = actor.companyId;
  } else if (params.companyId) {
    filter.companyId = params.companyId;
  }
  if (params.status) {
    filter.status = params.status;
  }
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { mobile: rx }];
  }

  const [data, total] = await Promise.all([
    UserModel.find(filter)
      .populate('roleId', 'name code')
      .populate('companyId', 'name')
      .sort({ [params.sortBy]: params.sortOrder })
      .skip(params.skip)
      .limit(params.limit),
    UserModel.countDocuments(filter),
  ]);
  return { data, total };
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
  const existing = await UserModel.findOne({ email, deletedAt: null });
  if (existing) {
    throw AppError.conflict('A user with this email already exists');
  }

  const role = await RoleModel.findById(input.roleId);
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

  const user = await UserModel.create({
    name: input.name,
    email,
    mobile: input.mobile ?? '',
    passwordHash: await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS),
    roleId: role._id,
    roleCode: role.code,
    companyId,
    status: input.status ?? 'active',
    createdBy: actor.id,
  });

  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'User',
    recordId: String(user._id),
    recordLabel: user.name,
  });

  return user;
}

export async function updateUser(id: string, input: Record<string, unknown>, actor: AuthUser) {
  const user = await UserModel.findOne({ _id: id, deletedAt: null });
  if (!user) {
    throw AppError.notFound('User not found');
  }
  if (!actor.isSuperAdmin && String(user.companyId) !== actor.companyId) {
    throw AppError.forbidden();
  }
  if (input.roleId) {
    const role = await RoleModel.findById(String(input.roleId));
    if (!role) {
      throw AppError.notFound('Role not found');
    }
    user.roleId = role._id;
    user.roleCode = role.code;
  }
  if (input.name) user.name = String(input.name);
  if (input.mobile !== undefined) user.mobile = String(input.mobile);
  if (input.status) user.status = input.status as typeof user.status;
  user.updatedBy = actor.id as unknown as typeof user.updatedBy;
  await user.save();
  await writeAudit({
    companyId: user.companyId ? String(user.companyId) : null,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'User',
    recordId: id,
    recordLabel: user.name,
  });
  return user;
}

export async function softDeleteUser(id: string, actor: AuthUser) {
  const user = await UserModel.findOne({ _id: id, deletedAt: null });
  if (!user) {
    throw AppError.notFound('User not found');
  }
  if (String(user._id) === actor.id) {
    throw AppError.badRequest('You cannot delete your own account');
  }
  if (!actor.isSuperAdmin && String(user.companyId) !== actor.companyId) {
    throw AppError.forbidden();
  }
  user.deletedAt = new Date();
  user.deletedBy = actor.id as unknown as typeof user.deletedBy;
  user.status = 'suspended';
  await user.save();
  await writeAudit({
    companyId: user.companyId ? String(user.companyId) : null,
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'User',
    recordId: id,
    recordLabel: user.name,
  });
  return user;
}

export async function listRoles(companyId: string | null, actor: AuthUser) {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (actor.isSuperAdmin) {
    if (companyId) {
      filter.$or = [{ companyId }, { companyId: null }];
    }
  } else {
    filter.companyId = actor.companyId;
  }
  return RoleModel.find(filter).sort({ name: 1 });
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
  const { AuditLogModel } = await import('../models/AuditLog.js');
  const filter: Record<string, unknown> = {};
  if (!params.actor.isSuperAdmin) {
    filter.companyId = params.actor.companyId;
  } else if (params.companyId) {
    filter.companyId = params.companyId;
  }
  if (params.module) filter.module = params.module;
  if (params.action) filter.action = params.action;

  const [data, total] = await Promise.all([
    AuditLogModel.find(filter).sort({ createdAt: -1 }).skip(params.skip).limit(params.limit),
    AuditLogModel.countDocuments(filter),
  ]);
  return { data, total };
}
