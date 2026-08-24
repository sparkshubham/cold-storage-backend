import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ROLE_CODES } from '../config/constants.js';
import { UserModel } from '../models/User.js';
import { RoleModel } from '../models/Role.js';
import { RefreshTokenModel } from '../models/RefreshToken.js';
import { CompanyModel } from '../models/Company.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/token.js';

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function buildAuthPayload(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user || user.deletedAt) {
    throw AppError.unauthorized('User not found');
  }
  const role = await RoleModel.findById(user.roleId);
  return {
    user,
    role,
    accessToken: signAccessToken({
      sub: String(user._id),
      role: user.roleCode,
      companyId: user.companyId ? String(user.companyId) : null,
      permissions: role?.permissionKeys ?? [],
    }),
  };
}

function publicUser(user: {
  _id: unknown;
  name: string;
  email: string;
  mobile?: string;
  roleCode: string;
  companyId?: unknown;
  status: string;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    mobile: user.mobile ?? '',
    role: user.roleCode,
    companyId: user.companyId ? String(user.companyId) : null,
    status: user.status,
  };
}

export async function login(input: {
  identifier: string;
  password: string;
  ip?: string;
  userAgent?: string;
}) {
  const identifier = input.identifier.trim().toLowerCase();
  const query = identifier.includes('@')
    ? { email: identifier, deletedAt: null }
    : { mobile: input.identifier.trim(), deletedAt: null };

  const user = await UserModel.findOne(query).select('+passwordHash');
  if (!user) {
    throw AppError.unauthorized('Invalid credentials');
  }
  if (user.status === 'suspended') {
    throw AppError.forbidden('Account is suspended');
  }
  if (user.status !== 'active') {
    throw AppError.forbidden('Account is not active');
  }

  const match = await bcrypt.compare(input.password, user.passwordHash);
  if (!match) {
    throw AppError.unauthorized('Invalid credentials');
  }

  if (user.roleCode !== ROLE_CODES.SUPER_ADMIN) {
    const company = await CompanyModel.findOne({ _id: user.companyId, deletedAt: null });
    if (!company) {
      throw AppError.forbidden('Company not found');
    }
    if (company.status === 'suspended') {
      throw AppError.forbidden('Company account is suspended');
    }
  }

  const { token: refreshToken, jti } = signRefreshToken(String(user._id));
  await RefreshTokenModel.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    jti,
    expiresAt: addDays(new Date(), 7),
    userAgent: input.userAgent ?? '',
    ip: input.ip ?? '',
  });

  user.lastLoginAt = new Date();
  await user.save();

  const { accessToken, role } = await buildAuthPayload(String(user._id));

  await writeAudit({
    companyId: user.companyId ? String(user.companyId) : null,
    userId: String(user._id),
    userName: user.name,
    action: 'LOGIN',
    module: 'Auth',
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return {
    user: publicUser(user),
    permissions: role?.permissionKeys ?? [],
    accessToken,
    refreshToken,
  };
}

export async function refresh(refreshToken: string, ip?: string, userAgent?: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized('Invalid refresh token');
  }

  const stored = await RefreshTokenModel.findOne({
    jti: payload.jti,
    tokenHash: hashToken(refreshToken),
    revokedAt: null,
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw AppError.unauthorized('Refresh token expired or revoked');
  }

  stored.revokedAt = new Date();
  await stored.save();

  const { token: nextRefresh, jti } = signRefreshToken(payload.sub);
  await RefreshTokenModel.create({
    userId: stored.userId,
    tokenHash: hashToken(nextRefresh),
    jti,
    expiresAt: addDays(new Date(), 7),
    userAgent: userAgent ?? '',
    ip: ip ?? '',
  });

  const { accessToken, user, role } = await buildAuthPayload(payload.sub);
  return {
    user: publicUser(user),
    permissions: role?.permissionKeys ?? [],
    accessToken,
    refreshToken: nextRefresh,
  };
}

export async function logout(refreshToken: string, userId: string, ip?: string, userAgent?: string) {
  const hash = hashToken(refreshToken);
  await RefreshTokenModel.updateMany(
    { userId, tokenHash: hash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  await writeAudit({
    userId,
    action: 'LOGOUT',
    module: 'Auth',
    ip,
    userAgent,
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) {
    throw AppError.notFound('User not found');
  }
  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) {
    throw AppError.unauthorized('Current password is incorrect');
  }
  user.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
  user.passwordChangedAt = new Date();
  await user.save();
  await RefreshTokenModel.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await writeAudit({
    companyId: user.companyId ? String(user.companyId) : null,
    userId: String(user._id),
    userName: user.name,
    action: 'UPDATE',
    module: 'Auth',
    recordLabel: 'Change password',
  });
}

export async function forgotPassword(email: string) {
  const user = await UserModel.findOne({ email: email.toLowerCase(), deletedAt: null });
  if (!user) {
    return { delivered: true };
  }
  const token = crypto.randomBytes(32).toString('hex');
  user.resetPasswordTokenHash = hashToken(token);
  user.resetPasswordExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  return {
    delivered: true,
    resetToken: env.NODE_ENV === 'production' ? undefined : token,
  };
}

export async function resetPassword(token: string, password: string) {
  const user = await UserModel.findOne({
    resetPasswordTokenHash: hashToken(token),
    resetPasswordExpiresAt: { $gt: new Date() },
    deletedAt: null,
  }).select('+resetPasswordTokenHash +resetPasswordExpiresAt');

  if (!user) {
    throw AppError.badRequest('Invalid or expired reset token');
  }
  user.passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  user.passwordChangedAt = new Date();
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpiresAt = null;
  await user.save();
  await RefreshTokenModel.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function getMe(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw AppError.notFound('User not found');
  }
  const role = await RoleModel.findById(user.roleId);
  const company = user.companyId
    ? await CompanyModel.findById(user.companyId).select('name status logoUrl')
    : null;
  return {
    ...publicUser(user),
    permissions: role?.permissionKeys ?? [],
    company: company
      ? { id: String(company._id), name: company.name, status: company.status, logoUrl: company.logoUrl }
      : null,
  };
}
