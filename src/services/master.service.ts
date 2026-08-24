import { CategoryModel } from '../models/Category.js';
import { UnitModel } from '../models/Unit.js';
import { CustomerModel } from '../models/Customer.js';
import { SupplierModel } from '../models/Supplier.js';
import { ProductModel } from '../models/Product.js';
import { makeTenantCrud } from './tenantCrud.js';

export const categoryService = makeTenantCrud({
  model: CategoryModel,
  module: 'Category',
  searchFields: ['name', 'code'],
  codePrefix: 'CAT',
});

export const unitService = makeTenantCrud({
  model: UnitModel,
  module: 'Unit',
  searchFields: ['name', 'code'],
});

export const customerService = makeTenantCrud({
  model: CustomerModel,
  module: 'Customer',
  searchFields: ['name', 'code', 'mobile', 'email', 'businessName', 'gstin'],
  codePrefix: 'CUS',
});

export const supplierService = makeTenantCrud({
  model: SupplierModel,
  module: 'Supplier',
  searchFields: ['name', 'code', 'mobile', 'email', 'gstin'],
  codePrefix: 'SUP',
});

export const productService = makeTenantCrud({
  model: ProductModel,
  module: 'Product',
  searchFields: ['name', 'code', 'sku', 'hsn'],
  codePrefix: 'PRD',
  populate: 'categoryId unitId',
});
