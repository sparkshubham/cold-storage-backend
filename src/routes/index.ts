import { Router } from 'express';
import authRoutes from './auth.routes.js';
import companyRoutes from './company.routes.js';
import { planRoutes, subscriptionRoutes } from './saas.routes.js';
import { userRoutes, roleRoutes, auditLogRoutes, dashboardRoutes } from './user.routes.js';
import { categoryRoutes, customerRoutes, productRoutes, supplierRoutes, unitRoutes } from './master.routes.js';
import { chamberRoutes, locationRoutes, rackRoutes } from './storage.routes.js';
import { inventoryRoutes, inwardRoutes, outwardRoutes, stockTransactionRoutes } from './inventory.routes.js';

export function createApiRouter() {
  const router = Router();
  router.use('/auth', authRoutes);
  router.use('/companies', companyRoutes);
  router.use('/plans', planRoutes);
  router.use('/subscriptions', subscriptionRoutes);
  router.use('/users', userRoutes);
  router.use('/roles', roleRoutes);
  router.use('/audit-logs', auditLogRoutes);
  router.use('/dashboards', dashboardRoutes);
  router.use('/categories', categoryRoutes);
  router.use('/units', unitRoutes);
  router.use('/customers', customerRoutes);
  router.use('/suppliers', supplierRoutes);
  router.use('/products', productRoutes);
  router.use('/chambers', chamberRoutes);
  router.use('/racks', rackRoutes);
  router.use('/locations', locationRoutes);
  router.use('/inventory', inventoryRoutes);
  router.use('/stock-transactions', stockTransactionRoutes);
  router.use('/inwards', inwardRoutes);
  router.use('/outwards', outwardRoutes);
  return router;
}
