import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { getAuthUser, requireTenantId } from '../types/auth.js';
import * as dashboardService from '../services/dashboard.service.js';
export const superAdminDashboard = asyncHandler(async (_req, res) => {
    const data = await dashboardService.getSuperAdminDashboard();
    return success(res, data);
});
export const companyDashboard = asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const companyId = user.isSuperAdmin ? req.tenantId ?? requireTenantId(req) : requireTenantId(req);
    const data = await dashboardService.getCompanyDashboard(companyId);
    return success(res, data);
});
//# sourceMappingURL=dashboard.controller.js.map