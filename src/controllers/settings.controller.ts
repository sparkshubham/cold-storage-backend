import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { getAuthUser, requireTenantId } from '../types/auth.js';
import * as settingsService from '../services/settings.service.js';

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const doc = await settingsService.getSettings(requireTenantId(req));
  return success(res, doc);
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const doc = await settingsService.updateSettings(requireTenantId(req), req.body, getAuthUser(req));
  return success(res, doc, 'Billing settings saved');
});
