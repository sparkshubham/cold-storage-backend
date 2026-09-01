import { asyncHandler } from '../utils/asyncHandler.js';
import { created, paginated, success } from '../utils/apiResponse.js';
import { getPagination, routeParam } from '../utils/pagination.js';
import { getAuthUser } from '../types/auth.js';
import * as planService from '../services/plan.service.js';
import * as subscriptionService from '../services/subscription.service.js';
export const createPlan = asyncHandler(async (req, res) => {
    const plan = await planService.createPlan(req.body, getAuthUser(req));
    return created(res, plan, 'Plan created successfully');
});
export const listPlans = asyncHandler(async (req, res) => {
    const pagination = getPagination(req);
    const result = await planService.listPlans(pagination);
    return paginated(res, result.data, { ...pagination, total: result.total });
});
export const getPlan = asyncHandler(async (req, res) => {
    const plan = await planService.getPlan(routeParam(req, 'id'));
    return success(res, plan);
});
export const updatePlan = asyncHandler(async (req, res) => {
    const plan = await planService.updatePlan(routeParam(req, 'id'), req.body, getAuthUser(req));
    return success(res, plan, 'Plan updated successfully');
});
export const removePlan = asyncHandler(async (req, res) => {
    await planService.softDeletePlan(routeParam(req, 'id'), getAuthUser(req));
    return success(res, null, 'Plan deleted');
});
export const createSubscription = asyncHandler(async (req, res) => {
    const subscription = await subscriptionService.createSubscription(req.body, getAuthUser(req));
    return created(res, subscription, 'Subscription created successfully');
});
export const listSubscriptions = asyncHandler(async (req, res) => {
    const pagination = getPagination(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const result = await subscriptionService.listSubscriptions({ ...pagination, status, companyId });
    return paginated(res, result.data, { ...pagination, total: result.total });
});
export const updateSubscriptionStatus = asyncHandler(async (req, res) => {
    const subscription = await subscriptionService.updateSubscriptionStatus(routeParam(req, 'id'), req.body.status, getAuthUser(req));
    return success(res, subscription, 'Subscription updated');
});
//# sourceMappingURL=saas.controller.js.map