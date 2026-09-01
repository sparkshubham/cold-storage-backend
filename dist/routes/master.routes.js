import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireCompanyContext, tenantGuard } from '../middleware/tenant.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { categorySchema, categoryUpdateSchema, customerSchema, customerUpdateSchema, productSchema, productUpdateSchema, supplierSchema, supplierUpdateSchema, unitSchema, unitUpdateSchema, } from '../validators/schemas.js';
import { categoryController, customerController, productController, supplierController, unitController, } from '../controllers/master.controller.js';
function tenantCrudRouter(options) {
    const router = Router();
    router.use(authenticate, tenantGuard, requireCompanyContext);
    router.get('/', authorize(options.view), options.controller.list);
    router.get('/:id', authorize(options.view), options.controller.get);
    router.post('/', authorize(options.create), validate(options.createSchema), options.controller.create);
    router.patch('/:id', authorize(options.update), validate(options.updateSchema), options.controller.update);
    router.delete('/:id', authorize(options.remove), options.controller.remove);
    return router;
}
export const categoryRoutes = tenantCrudRouter({
    view: 'category.view',
    create: 'category.create',
    update: 'category.update',
    remove: 'category.delete',
    createSchema: categorySchema,
    updateSchema: categoryUpdateSchema,
    controller: categoryController,
});
export const unitRoutes = tenantCrudRouter({
    view: 'unit.view',
    create: 'unit.create',
    update: 'unit.update',
    remove: 'unit.delete',
    createSchema: unitSchema,
    updateSchema: unitUpdateSchema,
    controller: unitController,
});
export const customerRoutes = tenantCrudRouter({
    view: 'customer.view',
    create: 'customer.create',
    update: 'customer.update',
    remove: 'customer.delete',
    createSchema: customerSchema,
    updateSchema: customerUpdateSchema,
    controller: customerController,
});
export const supplierRoutes = tenantCrudRouter({
    view: 'supplier.view',
    create: 'supplier.create',
    update: 'supplier.update',
    remove: 'supplier.delete',
    createSchema: supplierSchema,
    updateSchema: supplierUpdateSchema,
    controller: supplierController,
});
export const productRoutes = tenantCrudRouter({
    view: 'product.view',
    create: 'product.create',
    update: 'product.update',
    remove: 'product.delete',
    createSchema: productSchema,
    updateSchema: productUpdateSchema,
    controller: productController,
});
//# sourceMappingURL=master.routes.js.map