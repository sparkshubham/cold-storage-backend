import { asyncHandler } from '../utils/asyncHandler.js';
import { created, paginated, success } from '../utils/apiResponse.js';
import { getPagination, routeParam } from '../utils/pagination.js';
import { getAuthUser } from '../types/auth.js';
import * as userService from '../services/user.service.js';
export const list = asyncHandler(async (req, res) => {
    const pagination = getPagination(req);
    const actor = getAuthUser(req);
    const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const result = await userService.listUsers({ ...pagination, companyId, status }, actor);
    return paginated(res, result.data, { ...pagination, total: result.total });
});
export const create = asyncHandler(async (req, res) => {
    const user = await userService.createUser(req.body, getAuthUser(req));
    return created(res, user, 'User created successfully');
});
export const update = asyncHandler(async (req, res) => {
    const user = await userService.updateUser(routeParam(req, 'id'), req.body, getAuthUser(req));
    return success(res, user, 'User updated successfully');
});
export const remove = asyncHandler(async (req, res) => {
    await userService.softDeleteUser(routeParam(req, 'id'), getAuthUser(req));
    return success(res, null, 'User deleted');
});
export const listRoles = asyncHandler(async (req, res) => {
    const actor = getAuthUser(req);
    const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : actor.companyId;
    const roles = await userService.listRoles(companyId, actor);
    return success(res, roles);
});
export const listAuditLogs = asyncHandler(async (req, res) => {
    const pagination = getPagination(req);
    const actor = getAuthUser(req);
    const result = await userService.listAuditLogs({
        ...pagination,
        companyId: typeof req.query.companyId === 'string' ? req.query.companyId : undefined,
        module: typeof req.query.module === 'string' ? req.query.module : undefined,
        action: typeof req.query.action === 'string' ? req.query.action : undefined,
        actor,
    });
    return paginated(res, result.data, { ...pagination, total: result.total });
});
//# sourceMappingURL=user.controller.js.map