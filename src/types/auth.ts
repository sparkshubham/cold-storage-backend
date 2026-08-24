import mongoose from 'mongoose';
import type { Request } from 'express';
import { AppError } from '../utils/AppError.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  companyId: string | null;
  permissions: string[];
  isSuperAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      tenantId?: string | null;
    }
  }
}

export function getAuthUser(req: Request): AuthUser {
  if (!req.authUser) {
    throw AppError.unauthorized();
  }
  return req.authUser;
}

export function requireTenantId(req: Request): string {
  const user = getAuthUser(req);
  const tenantId = req.tenantId ?? user.companyId;
  if (!tenantId) {
    throw AppError.badRequest('Company context is required');
  }
  return tenantId;
}

export function toObjectId(id: string) {
  return new mongoose.Types.ObjectId(id);
}
