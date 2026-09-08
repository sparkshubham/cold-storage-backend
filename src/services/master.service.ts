import { makeTenantCrud } from './tenantCrud.js';

export const categoryService = makeTenantCrud({
  model: 'category',
  module: 'Category',
  searchFields: ['name', 'code'],
  codePrefix: 'CAT',
});

export const unitService = makeTenantCrud({
  model: 'unit',
  module: 'Unit',
  searchFields: ['name', 'code'],
});

export const customerService = makeTenantCrud({
  model: 'customer',
  module: 'Customer',
  searchFields: ['name', 'code', 'mobile', 'email', 'businessName', 'gstin'],
  codePrefix: 'CUS',
});

export const supplierService = makeTenantCrud({
  model: 'supplier',
  module: 'Supplier',
  searchFields: ['name', 'code', 'mobile', 'email', 'gstin'],
  codePrefix: 'SUP',
});

export const productService = makeTenantCrud({
  model: 'product',
  module: 'Product',
  searchFields: ['name', 'code', 'sku', 'hsn'],
  codePrefix: 'PRD',
  populate: 'categoryId unitId',
});
