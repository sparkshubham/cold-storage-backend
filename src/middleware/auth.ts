import type { RequestHandler } from 'express';
import { UserModel } from '../models/User.js';
import { RoleModel } from '../models/Role.js';
import { CompanyModel } from '../models/Company.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/token.js';
import { ROLE_CODES } from '../config/constants.js';
import type { AuthUser } from '../types/auth.js';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    throw AppError.unauthorized('Authentication required');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw AppError.unauthorized('Invalid or expired access token');
  }

  if (payload.type !== 'access') {
    throw AppError.unauthorized('Invalid token type');
  }

  const user = await UserModel.findOne({ _id: payload.sub, deletedAt: null });
  if (!user) {
    throw AppError.unauthorized('User not found');
  }
  if (user.status === 'suspended') {
    throw AppError.forbidden('Account is suspended');
  }
  if (user.status !== 'active') {
    throw AppError.forbidden('Account is not active');
  }

  const role = await RoleModel.findById(user.roleId);
  const permissions = role?.permissionKeys ?? payload.permissions ?? [];
  const isSuperAdmin = user.roleCode === ROLE_CODES.SUPER_ADMIN;

  if (!isSuperAdmin) {
    if (!user.companyId) {
      throw AppError.forbidden('User is not assigned to a company');
    }
    const company = await CompanyModel.findOne({ _id: user.companyId, deletedAt: null });
    if (!company) {
      throw AppError.forbidden('Company not found');
    }
    if (company.status === 'suspended') {
      throw AppError.forbidden('Company account is suspended');
    }
  }

  const authUser: AuthUser = {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.roleCode,
    companyId: user.companyId ? String(user.companyId) : null,
    permissions,
    isSuperAdmin,
  };

  req.authUser = authUser;
  req.tenantId = authUser.companyId;
  next();
});

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.authUser?.isSuperAdmin) {
    return next(AppError.forbidden('Super admin access required'));
  }
  next();
};
