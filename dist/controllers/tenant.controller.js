import { asyncHandler } from '../utils/asyncHandler.js';
import { created, paginated, success } from '../utils/apiResponse.js';
import { getPagination, queryString, routeParam } from '../utils/pagination.js';
import { getAuthUser, requireTenantId } from '../types/auth.js';
export function makeTenantController(service) {
    return {
        list: asyncHandler(async (req, res) => {
            const pagination = getPagination(req);
            const result = await service.list(requireTenantId(req), {
                ...pagination,
                status: queryString(req, 'status'),
            });
            return paginated(res, result.data, { ...pagination, total: result.total });
        }),
        get: asyncHandler(async (req, res) => {
            if (!service.get)
                return success(res, null);
            const doc = await service.get(requireTenantId(req), routeParam(req, 'id'));
            return success(res, doc);
        }),
        create: asyncHandler(async (req, res) => {
            const doc = await service.create(requireTenantId(req), req.body, getAuthUser(req));
            return created(res, doc);
        }),
        update: asyncHandler(async (req, res) => {
            const doc = await service.update(requireTenantId(req), routeParam(req, 'id'), req.body, getAuthUser(req));
            return success(res, doc, 'Updated successfully');
        }),
        remove: asyncHandler(async (req, res) => {
            await service.remove(requireTenantId(req), routeParam(req, 'id'), getAuthUser(req));
            return success(res, null, 'Deleted');
        }),
    };
}
//# sourceMappingURL=tenant.controller.js.map