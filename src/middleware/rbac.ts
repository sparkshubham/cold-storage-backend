import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';
import { getAuthUser } from '../types/auth.js';

export function authorize(...required: string[]): RequestHandler {
  return (req, _res, next) => {
    const user = getAuthUser(req);
    if (user.isSuperAdmin) {
      return next();
    }
    const missing = required.filter((key) => !user.permissions.includes(key));
    if (missing.length > 0) {
      return next(AppError.forbidden('Insufficient permissions'));
    }
    next();
  };
}
