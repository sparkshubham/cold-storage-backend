import { PERMISSIONS, ROLE_CODES, type RoleCode } from './constants.js';

const ALL = [...PERMISSIONS];

const FINANCIAL = [
  'invoice.create',
  'invoice.view',
  'invoice.update',
  'invoice.delete',
  'payment.create',
  'payment.view',
  'payment.delete',
  'ledger.view',
  'expense.create',
  'expense.view',
  'expense.update',
  'expense.delete',
  'rental.view',
  'rental.update',
];

const PLATFORM = [
  'company.create',
  'company.view',
  'company.update',
  'company.delete',
  'company.suspend',
  'company.activate',
  'plan.create',
  'plan.view',
  'plan.update',
  'plan.delete',
  'subscription.create',
  'subscription.view',
  'subscription.update',
  'subscription.cancel',
];

export const SYSTEM_ROLES: Array<{
  name: string;
  code: RoleCode;
  description: string;
  isPlatform: boolean;
  permissionKeys: string[];
}> = [
  {
    name: 'SaaS Super Admin',
    code: ROLE_CODES.SUPER_ADMIN,
    description: 'Full platform control',
    isPlatform: true,
    permissionKeys: ALL,
  },
  {
    name: 'Company Admin',
    code: ROLE_CODES.COMPANY_ADMIN,
    description: 'Full control of one cold-storage company',
    isPlatform: false,
    permissionKeys: ALL.filter((p) => !PLATFORM.includes(p)),
  },
  {
    name: 'Manager',
    code: ROLE_CODES.MANAGER,
    description: 'Operations manager with restricted finance access',
    isPlatform: false,
    permissionKeys: ALL.filter(
      (p) =>
        !PLATFORM.includes(p) &&
        !['invoice.create', 'invoice.update', 'invoice.delete', 'payment.create', 'payment.delete', 'expense.create', 'expense.update', 'expense.delete', 'rental.update'].includes(p),
    ),
  },
  {
    name: 'Accountant',
    code: ROLE_CODES.ACCOUNTANT,
    description: 'Financial operations without stock modification',
    isPlatform: false,
    permissionKeys: [
      'customer.create',
      'customer.view',
      'customer.update',
      'product.view',
      'inventory.view',
      'inward.view',
      'outward.view',
      ...FINANCIAL,
      'report.view',
      'report.export',
      'document.view',
      'document.upload',
      'audit.view',
      'notification.view',
    ],
  },
  {
    name: 'Warehouse Staff',
    code: ROLE_CODES.WAREHOUSE_STAFF,
    description: 'Inward, allocation, transfers, picking',
    isPlatform: false,
    permissionKeys: [
      'customer.view',
      'product.view',
      'chamber.view',
      'rack.view',
      'location.view',
      'inventory.view',
      'inventory.adjust',
      'inventory.transfer',
      'batch.create',
      'batch.view',
      'batch.update',
      'inward.create',
      'inward.view',
      'inward.update',
      'inward.cancel',
      'outward.create',
      'outward.view',
      'outward.update',
      'weighment.create',
      'weighment.view',
      'quality.create',
      'quality.view',
      'notification.view',
    ],
  },
  {
    name: 'Gate / Security Staff',
    code: ROLE_CODES.GATE_STAFF,
    description: 'Gate entry, vehicles, gate pass verification',
    isPlatform: false,
    permissionKeys: [
      'customer.view',
      'vehicle.create',
      'vehicle.view',
      'vehicle.update',
      'driver.create',
      'driver.view',
      'driver.update',
      'gate.create',
      'gate.view',
      'gate.update',
      'inward.view',
      'outward.view',
      'weighment.view',
      'notification.view',
    ],
  },
];
