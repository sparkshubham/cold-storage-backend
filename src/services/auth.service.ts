import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ROLE_CODES } from '../config/constants.js';
import { prisma } from '../db/prisma.js';
import { notDeleted } from '../db/serialize.js';
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
  const user = await prisma.user.findFirst({
    where: notDeleted({ id: userId }),
    include: { role: { select: { permissionKeys: true } } },
  });
  if (!user) {
    throw AppError.unauthorized('User not found');
  }
  return {
    user,
    role: user.role,
    accessToken: signAccessToken({
      sub: user.id,
      role: user.roleCode,
      companyId: user.companyId ?? null,
      permissions: user.role?.permissionKeys ?? [],
    }),
  };
}

function publicUser(user: {
  id: string;
  name: string;
  email: string;
  mobile?: string | null;
  roleCode: string;
  companyId?: string | null;
  status: string;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile ?? '',
    role: user.roleCode,
    companyId: user.companyId ?? null,
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
  const user = identifier.includes('@')
    ? await prisma.user.findFirst({ where: notDeleted({ email: identifier }) })
    : await prisma.user.findFirst({ where: notDeleted({ mobile: input.identifier.trim() }) });

  if (!user) {
    throw AppError.unauthorized('Invalid credentials');
  }
  if (user.status === 'suspended') {
    throw AppError.forbidden('Account is suspended');
  }
  if (user.status !== 'active') {
    throw AppError.forbidden('Account is not active');
  }

  const [match, company, role] = await Promise.all([
    bcrypt.compare(input.password, user.passwordHash),
    user.roleCode === ROLE_CODES.SUPER_ADMIN || !user.companyId
      ? Promise.resolve(null)
      : prisma.company.findFirst({
          where: notDeleted({ id: user.companyId }),
          select: { status: true },
        }),
    prisma.role.findFirst({
      where: { id: user.roleId },
      select: { permissionKeys: true },
    }),
  ]);
  if (!match) {
    throw AppError.unauthorized('Invalid credentials');
  }

  if (user.roleCode !== ROLE_CODES.SUPER_ADMIN) {
    if (!company) {
      throw AppError.forbidden('Company not found');
    }
    if (company.status === 'suspended') {
      throw AppError.forbidden('Company account is suspended');
    }
  }

  const { token: refreshToken, jti } = signRefreshToken(user.id);
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.roleCode,
    companyId: user.companyId ?? null,
    permissions: role?.permissionKeys ?? [],
  });

  const lastLoginAt = new Date();
  await Promise.all([
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        jti,
        expiresAt: addDays(new Date(), 7),
        userAgent: input.userAgent ?? '',
        ip: input.ip ?? '',
      },
    }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt } }),
    writeAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: 'LOGIN',
      module: 'Auth',
      ip: input.ip,
      userAgent: input.userAgent,
    }),
  ]);

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

  const stored = await prisma.refreshToken.findFirst({
    where: {
      jti: payload.jti,
      tokenHash: hashToken(refreshToken),
      revokedAt: null,
    },
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw AppError.unauthorized('Refresh token expired or revoked');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const { token: nextRefresh, jti } = signRefreshToken(payload.sub);
  await prisma.refreshToken.create({
    data: {
      userId: stored.userId,
      tokenHash: hashToken(nextRefresh),
      jti,
      expiresAt: addDays(new Date(), 7),
      userAgent: userAgent ?? '',
      ip: ip ?? '',
    },
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
  await prisma.refreshToken.updateMany({
    where: { userId, tokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAudit({
    userId,
    action: 'LOGOUT',
    module: 'Auth',
    ip,
    userAgent,
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findFirst({ where: { id: userId } });
  if (!user) {
    throw AppError.notFound('User not found');
  }
  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) {
    throw AppError.unauthorized('Current password is incorrect');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS),
      passwordChangedAt: new Date(),
    },
  });
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAudit({
    companyId: user.companyId,
    userId: user.id,
    userName: user.name,
    action: 'UPDATE',
    module: 'Auth',
    recordLabel: 'Change password',
  });
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findFirst({ where: notDeleted({ email: email.toLowerCase() }) });
  if (!user) {
    return { delivered: true };
  }
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordTokenHash: hashToken(token),
      resetPasswordExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return {
    delivered: true,
    resetToken: env.NODE_ENV === 'production' ? undefined : token,
  };
}

export async function resetPassword(token: string, password: string) {
  const user = await prisma.user.findFirst({
    where: {
      resetPasswordTokenHash: hashToken(token),
      resetPasswordExpiresAt: { gt: new Date() },
      deletedAt: null,
    },
  });

  if (!user) {
    throw AppError.badRequest('Invalid or expired reset token');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS),
      passwordChangedAt: new Date(),
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
    },
  });
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId } });
  if (!user) {
    throw AppError.notFound('User not found');
  }
  const role = await prisma.role.findFirst({ where: { id: user.roleId } });
  const company = user.companyId
    ? await prisma.company.findFirst({
        where: { id: user.companyId },
        select: { id: true, name: true, status: true, logoUrl: true },
      })
    : null;
  return {
    ...publicUser(user),
    permissions: role?.permissionKeys ?? [],
    company: company
      ? { id: company.id, name: company.name, status: company.status, logoUrl: company.logoUrl }
      : null,
  };
}
