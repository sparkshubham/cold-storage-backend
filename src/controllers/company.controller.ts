import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, paginated, success } from '../utils/apiResponse.js';
import { getPagination, routeParam } from '../utils/pagination.js';
import { getAuthUser } from '../types/auth.js';
import * as companyService from '../services/company.service.js';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const company = await companyService.createCompany(req.body, getAuthUser(req));
  return created(res, company, 'Company created successfully');
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const pagination = getPagination(req);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const result = await companyService.listCompanies({ ...pagination, status });
  return paginated(res, result.data, { ...pagination, total: result.total });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const data = await companyService.getCompany(routeParam(req, 'id'));
  return success(res, data);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const company = await companyService.updateCompany(routeParam(req, 'id'), req.body, getAuthUser(req));
  return success(res, company, 'Company updated successfully');
});

export const suspend = asyncHandler(async (req: Request, res: Response) => {
  const company = await companyService.setCompanyStatus(routeParam(req, 'id'), 'suspended', getAuthUser(req));
  return success(res, company, 'Company suspended');
});

export const activate = asyncHandler(async (req: Request, res: Response) => {
  const company = await companyService.setCompanyStatus(routeParam(req, 'id'), 'active', getAuthUser(req));
  return success(res, company, 'Company activated');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await companyService.softDeleteCompany(routeParam(req, 'id'), getAuthUser(req));
  return success(res, null, 'Company deleted');
});
