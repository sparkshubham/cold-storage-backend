import { categoryService, customerService, productService, supplierService, unitService } from '../services/master.service.js';
import { makeTenantController } from './tenant.controller.js';
export const categoryController = makeTenantController(categoryService);
export const unitController = makeTenantController(unitService);
export const customerController = makeTenantController(customerService);
export const supplierController = makeTenantController(supplierService);
export const productController = makeTenantController(productService);
//# sourceMappingURL=master.controller.js.map