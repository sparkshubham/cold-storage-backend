import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireCompanyContext, tenantGuard } from '../middleware/tenant.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { companySettingsSchema } from '../validators/schemas.js';
import * as settingsController from '../controllers/settings.controller.js';

const settings = Router();
settings.use(authenticate, tenantGuard, requireCompanyContext);
settings.get('/', authorize('settings.view'), settingsController.getSettings);
settings.patch('/', authorize('settings.update'), validate(companySettingsSchema), settingsController.updateSettings);

export { settings as settingsRoutes };
