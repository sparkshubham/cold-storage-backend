import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, paginated, success } from '../utils/apiResponse.js';
import { getPagination, queryString, routeParam } from '../utils/pagination.js';
import { getAuthUser, requireTenantId } from '../types/auth.js';
import type { AuthUser } from '../types/auth.js';

type TenantService = {
  list: (companyId: string, params: ReturnType<typeof getPagination> & { status?: string }) => Promise<{ data: unknown[]; total: number }>;
  get?: (companyId: string, id: string) => Promise<unknown>;
  create: (companyId: string, input: Record<string, unknown>, actor: AuthUser) => Promise<unknown>;
  update: (companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) => Promise<unknown>;
  remove: (companyId: string, id: string, actor: AuthUser) => Promise<unknown>;
};

export function makeTenantController(service: TenantService) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const pagination = getPagination(req);
      const result = await service.list(requireTenantId(req), {
        ...pagination,
        status: queryString(req, 'status'),
      });
      return paginated(res, result.data as object[], { ...pagination, total: result.total });
    }),
    get: asyncHandler(async (req: Request, res: Response) => {
      if (!service.get) return success(res, null);
      const doc = await service.get(requireTenantId(req), routeParam(req, 'id'));
      return success(res, doc);
    }),
    create: asyncHandler(async (req: Request, res: Response) => {
      const doc = await service.create(requireTenantId(req), req.body, getAuthUser(req));
      return created(res, doc);
    }),
    update: asyncHandler(async (req: Request, res: Response) => {
      const doc = await service.update(requireTenantId(req), routeParam(req, 'id'), req.body, getAuthUser(req));
      return success(res, doc, 'Updated successfully');
    }),
    remove: asyncHandler(async (req: Request, res: Response) => {
      await service.remove(requireTenantId(req), routeParam(req, 'id'), getAuthUser(req));
      return success(res, null, 'Deleted');
    }),
  };
}
