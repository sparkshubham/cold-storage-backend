import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, paginated, success } from '../utils/apiResponse.js';
import { getPagination, queryString, routeParam } from '../utils/pagination.js';
import { getAuthUser, requireTenantId } from '../types/auth.js';
import * as inventoryService from '../services/inventory.service.js';

export const listInventory = asyncHandler(async (req: Request, res: Response) => {
  const pagination = getPagination(req);
  const result = await inventoryService.listInventory(requireTenantId(req), {
    ...pagination,
    status: queryString(req, 'status'),
    customerId: queryString(req, 'customerId'),
    productId: queryString(req, 'productId'),
    chamberId: queryString(req, 'chamberId'),
  });
  return paginated(res, result.data, { ...pagination, total: result.total });
});

export const createOpeningStock = asyncHandler(async (req: Request, res: Response) => {
  const doc = await inventoryService.createOpeningStock(requireTenantId(req), req.body, getAuthUser(req));
  return created(res, doc, 'Opening stock recorded');
});

export const createAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const doc = await inventoryService.createAdjustment(requireTenantId(req), req.body, getAuthUser(req));
  return created(res, doc, 'Stock adjustment recorded');
});

export const listStockTransactions = asyncHandler(async (req: Request, res: Response) => {
  const pagination = getPagination(req);
  const result = await inventoryService.listStockTransactions(requireTenantId(req), {
    ...pagination,
    productId: queryString(req, 'productId'),
    type: queryString(req, 'type'),
  });
  return paginated(res, result.data, { ...pagination, total: result.total });
});

export const listInwards = asyncHandler(async (req: Request, res: Response) => {
  const pagination = getPagination(req);
  const result = await inventoryService.listInwards(requireTenantId(req), pagination);
  return paginated(res, result.data, { ...pagination, total: result.total });
});

export const createInward = asyncHandler(async (req: Request, res: Response) => {
  const doc = await inventoryService.createInward(requireTenantId(req), req.body, getAuthUser(req));
  return created(res, doc, 'Inward completed');
});

export const getInward = asyncHandler(async (req: Request, res: Response) => {
  const doc = await inventoryService.getInward(requireTenantId(req), routeParam(req, 'id'));
  return success(res, doc);
});

export const listOutwards = asyncHandler(async (req: Request, res: Response) => {
  const pagination = getPagination(req);
  const result = await inventoryService.listOutwards(requireTenantId(req), pagination);
  return paginated(res, result.data, { ...pagination, total: result.total });
});

export const createOutward = asyncHandler(async (req: Request, res: Response) => {
  const doc = await inventoryService.createOutward(requireTenantId(req), req.body, getAuthUser(req));
  return created(res, doc, 'Outward completed');
});

export const getOutward = asyncHandler(async (req: Request, res: Response) => {
  const doc = await inventoryService.getOutward(requireTenantId(req), routeParam(req, 'id'));
  return success(res, doc);
});

export const updateInward = asyncHandler(async (req: Request, res: Response) => {
  const doc = await inventoryService.updateInward(requireTenantId(req), routeParam(req, 'id'), req.body, getAuthUser(req));
  return success(res, doc, 'Inward updated');
});

export const updateOutward = asyncHandler(async (req: Request, res: Response) => {
  const doc = await inventoryService.updateOutward(requireTenantId(req), routeParam(req, 'id'), req.body, getAuthUser(req));
  return success(res, doc, 'Outward updated');
});

export const cancelInward = asyncHandler(async (req: Request, res: Response) => {
  const doc = await inventoryService.cancelInward(requireTenantId(req), routeParam(req, 'id'), getAuthUser(req));
  return success(res, doc, 'Inward cancelled');
});

export const cancelOutward = asyncHandler(async (req: Request, res: Response) => {
  const doc = await inventoryService.cancelOutward(requireTenantId(req), routeParam(req, 'id'), getAuthUser(req));
  return success(res, doc, 'Outward cancelled');
});
