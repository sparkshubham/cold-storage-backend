import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, paginated, success } from '../utils/apiResponse.js';
import { getPagination, queryString, routeParam } from '../utils/pagination.js';
import { getAuthUser, requireTenantId } from '../types/auth.js';
import * as storageService from '../services/storage.service.js';

export const listChambers = asyncHandler(async (req: Request, res: Response) => {
  const pagination = getPagination(req);
  const result = await storageService.listChambers(requireTenantId(req), {
    ...pagination,
    status: queryString(req, 'status'),
  });
  return paginated(res, result.data, { ...pagination, total: result.total });
});

export const createChamber = asyncHandler(async (req: Request, res: Response) => {
  const doc = await storageService.createChamber(requireTenantId(req), req.body, getAuthUser(req));
  return created(res, doc);
});

export const updateChamber = asyncHandler(async (req: Request, res: Response) => {
  const doc = await storageService.updateChamber(requireTenantId(req), routeParam(req, 'id'), req.body, getAuthUser(req));
  return success(res, doc, 'Chamber updated');
});

export const removeChamber = asyncHandler(async (req: Request, res: Response) => {
  await storageService.removeChamber(requireTenantId(req), routeParam(req, 'id'), getAuthUser(req));
  return success(res, null, 'Chamber deleted');
});

export const listRacks = asyncHandler(async (req: Request, res: Response) => {
  const pagination = getPagination(req);
  const result = await storageService.listRacks(requireTenantId(req), {
    ...pagination,
    status: queryString(req, 'status'),
    chamberId: queryString(req, 'chamberId'),
  });
  return paginated(res, result.data, { ...pagination, total: result.total });
});

export const createRack = asyncHandler(async (req: Request, res: Response) => {
  const doc = await storageService.createRack(requireTenantId(req), req.body, getAuthUser(req));
  return created(res, doc);
});

export const updateRack = asyncHandler(async (req: Request, res: Response) => {
  const doc = await storageService.updateRack(requireTenantId(req), routeParam(req, 'id'), req.body, getAuthUser(req));
  return success(res, doc, 'Rack updated');
});

export const removeRack = asyncHandler(async (req: Request, res: Response) => {
  await storageService.removeRack(requireTenantId(req), routeParam(req, 'id'), getAuthUser(req));
  return success(res, null, 'Rack deleted');
});

export const listLocations = asyncHandler(async (req: Request, res: Response) => {
  const pagination = getPagination(req);
  const result = await storageService.listLocations(requireTenantId(req), {
    ...pagination,
    status: queryString(req, 'status'),
    chamberId: queryString(req, 'chamberId'),
    rackId: queryString(req, 'rackId'),
  });
  return paginated(res, result.data, { ...pagination, total: result.total });
});

export const createLocation = asyncHandler(async (req: Request, res: Response) => {
  const doc = await storageService.createLocation(requireTenantId(req), req.body, getAuthUser(req));
  return created(res, doc);
});

export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const doc = await storageService.updateLocation(requireTenantId(req), routeParam(req, 'id'), req.body, getAuthUser(req));
  return success(res, doc, 'Location updated');
});

export const removeLocation = asyncHandler(async (req: Request, res: Response) => {
  await storageService.removeLocation(requireTenantId(req), routeParam(req, 'id'), getAuthUser(req));
  return success(res, null, 'Location deleted');
});
