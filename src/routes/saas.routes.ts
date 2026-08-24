import { Router } from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { planSchema, subscriptionCreateSchema } from '../validators/schemas.js';
import * as saasController from '../controllers/saas.controller.js';

const plans = Router();
plans.use(authenticate, requireSuperAdmin);
plans.get('/', saasController.listPlans);
plans.post('/', validate(planSchema), saasController.createPlan);
plans.get('/:id', saasController.getPlan);
plans.patch('/:id', validate(planSchema.partial()), saasController.updatePlan);
plans.delete('/:id', saasController.removePlan);

const subscriptions = Router();
subscriptions.use(authenticate, requireSuperAdmin);
subscriptions.get('/', saasController.listSubscriptions);
subscriptions.post('/', validate(subscriptionCreateSchema), saasController.createSubscription);
subscriptions.patch('/:id/status', saasController.updateSubscriptionStatus);

export { plans as planRoutes, subscriptions as subscriptionRoutes };
