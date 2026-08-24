import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { getAuthUser, requireTenantId } from '../types/auth.js';
import * as dashboardService from '../services/dashboard.service.js';

export const superAdminDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const data = await dashboardService.getSuperAdminDashboard();
  return success(res, data);
});

export const companyDashboard = asyncHandler(async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const companyId = user.isSuperAdmin ? req.tenantId ?? requireTenantId(req) : requireTenantId(req);
  const data = await dashboardService.getCompanyDashboard(companyId);
  return success(res, data);
});
