import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, paginated, success } from '../utils/apiResponse.js';
import { getPagination, queryString, routeParam } from '../utils/pagination.js';
import { getAuthUser, requireTenantId } from '../types/auth.js';
import * as invoiceService from '../services/invoice.service.js';

export const listInvoices = asyncHandler(async (req: Request, res: Response) => {
  const pagination = getPagination(req);
  const result = await invoiceService.listInvoices(requireTenantId(req), {
    ...pagination,
    status: queryString(req, 'status'),
  });
  return paginated(res, result.data, { ...pagination, total: result.total });
});

export const previewInvoice = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as {
    sourceType: 'inward' | 'outward';
    sourceId: string;
    storageRatePerUnitPerDay?: number;
    inwardHandlingRate?: number;
    outwardHandlingRate?: number;
    gstRate?: number;
  };
  const draft = await invoiceService.previewInvoice(requireTenantId(req), query.sourceType, query.sourceId, query);
  return success(res, draft);
});

export const generateInvoice = asyncHandler(async (req: Request, res: Response) => {
  const doc = await invoiceService.generateInvoice(requireTenantId(req), req.body, getAuthUser(req));
  return created(res, doc, 'Bill generated');
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  const doc = await invoiceService.getInvoice(requireTenantId(req), routeParam(req, 'id'));
  return success(res, doc);
});

export const updateInvoice = asyncHandler(async (req: Request, res: Response) => {
  const doc = await invoiceService.updateInvoice(requireTenantId(req), routeParam(req, 'id'), req.body, getAuthUser(req));
  return success(res, doc, 'Bill updated');
});

export const cancelInvoice = asyncHandler(async (req: Request, res: Response) => {
  const doc = await invoiceService.cancelInvoice(requireTenantId(req), routeParam(req, 'id'), getAuthUser(req));
  return success(res, doc, 'Bill cancelled');
});
