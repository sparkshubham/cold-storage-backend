import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireCompanyContext, tenantGuard } from '../middleware/tenant.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { adjustmentSchema, inwardSchema, movementMetaSchema, openingStockSchema, outwardSchema } from '../validators/schemas.js';
import * as inventoryController from '../controllers/inventory.controller.js';

const inventory = Router();
inventory.use(authenticate, tenantGuard, requireCompanyContext);
inventory.get('/', authorize('inventory.view'), inventoryController.listInventory);
inventory.post('/opening', authorize('inventory.adjust'), validate(openingStockSchema), inventoryController.createOpeningStock);
inventory.post('/adjustments', authorize('inventory.adjust'), validate(adjustmentSchema), inventoryController.createAdjustment);

const stockTransactions = Router();
stockTransactions.use(authenticate, tenantGuard, requireCompanyContext);
stockTransactions.get('/', authorize('inventory.view'), inventoryController.listStockTransactions);

const inwards = Router();
inwards.use(authenticate, tenantGuard, requireCompanyContext);
inwards.get('/', authorize('inward.view'), inventoryController.listInwards);
inwards.get('/:id', authorize('inward.view'), inventoryController.getInward);
inwards.post('/', authorize('inward.create'), validate(inwardSchema), inventoryController.createInward);
inwards.patch('/:id', authorize('inward.update'), validate(movementMetaSchema), inventoryController.updateInward);
inwards.post('/:id/cancel', authorize('inward.cancel'), inventoryController.cancelInward);

const outwards = Router();
outwards.use(authenticate, tenantGuard, requireCompanyContext);
outwards.get('/', authorize('outward.view'), inventoryController.listOutwards);
outwards.get('/:id', authorize('outward.view'), inventoryController.getOutward);
outwards.post('/', authorize('outward.create'), validate(outwardSchema), inventoryController.createOutward);
outwards.patch('/:id', authorize('outward.update'), validate(movementMetaSchema), inventoryController.updateOutward);
outwards.post('/:id/cancel', authorize('outward.cancel'), inventoryController.cancelOutward);

export {
  inventory as inventoryRoutes,
  stockTransactions as stockTransactionRoutes,
  inwards as inwardRoutes,
  outwards as outwardRoutes,
};
