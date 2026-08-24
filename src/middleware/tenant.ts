import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';
import { getAuthUser } from '../types/auth.js';

/**
 * Tenant isolation: companyId is always derived from the authenticated user.
 * Super admins may optionally impersonate a company via x-company-id header
 * for support, never via request body.
 */
export const tenantGuard: RequestHandler = (req, _res, next) => {
  const user = getAuthUser(req);

  if (user.isSuperAdmin) {
    const impersonate = req.header('x-company-id');
    req.tenantId = impersonate || null;
    return next();
  }

  if (!user.companyId) {
    return next(AppError.forbidden('Missing company context'));
  }

  req.tenantId = user.companyId;
  next();
};

export const requireCompanyContext: RequestHandler = (req, _res, next) => {
  if (!req.tenantId) {
    return next(AppError.badRequest('Company context is required'));
  }
  next();
};
