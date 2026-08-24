import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { getAuthUser } from '../types/auth.js';
import * as authService from '../services/auth.service.js';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login({
    identifier: req.body.identifier,
    password: req.body.password,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  return success(res, result, 'Logged in successfully');
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.refresh(req.body.refreshToken, req.ip, req.get('user-agent'));
  return success(res, result, 'Token refreshed');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  await authService.logout(req.body.refreshToken ?? '', user.id, req.ip, req.get('user-agent'));
  return success(res, null, 'Logged out successfully');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const data = await authService.getMe(user.id);
  return success(res, data);
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  await authService.changePassword(user.id, req.body.currentPassword, req.body.newPassword);
  return success(res, null, 'Password changed successfully');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const data = await authService.forgotPassword(req.body.email);
  return success(res, data, 'If the account exists, a reset link has been issued');
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.token, req.body.password);
  return success(res, null, 'Password reset successfully');
});
