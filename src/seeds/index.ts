import '../config/loadEnv.js';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { PERMISSIONS, ROLE_CODES } from '../config/constants.js';
import { SYSTEM_ROLES } from '../config/roles.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { PermissionModel } from '../models/Permission.js';
import { RoleModel } from '../models/Role.js';
import { UserModel } from '../models/User.js';
import { PlanModel } from '../models/Plan.js';
import { CompanyModel } from '../models/Company.js';
import { SettingsModel } from '../models/Settings.js';
import { logger } from '../utils/logger.js';
import { createCompanyRoles } from '../services/company.service.js';
import { categoryService, customerService, productService, supplierService, unitService } from '../services/master.service.js';
import { createChamber, createLocation, createRack } from '../services/storage.service.js';
import { createInward, createOpeningStock } from '../services/inventory.service.js';
import { CustomerModel } from '../models/Customer.js';
import { isMainModule } from '../utils/isMain.js';

async function seedPermissions() {
  const docs = PERMISSIONS.map((key) => {
    const [module, action] = key.split('.');
    return { key, module, action, description: key };
  });
  for (const doc of docs) {
    await PermissionModel.updateOne({ key: doc.key }, { $set: doc }, { upsert: true });
  }
}

async function seedPlatformRole() {
  const superAdmin = SYSTEM_ROLES.find((r) => r.code === ROLE_CODES.SUPER_ADMIN)!;
  await RoleModel.updateOne(
    { code: superAdmin.code, companyId: null },
    {
      $set: {
        name: superAdmin.name,
        description: superAdmin.description,
        isSystem: true,
        permissionKeys: superAdmin.permissionKeys,
        companyId: null,
      },
    },
    { upsert: true },
  );
}

async function seedPlans() {
  const plans = [
    {
      name: 'Basic',
      code: 'BASIC',
      price: 4999,
      billingCycle: 'monthly',
      maxUsers: 10,
      maxChambers: 5,
      maxStorage: 2000,
      maxCustomers: 200,
      features: ['Masters', 'Inventory', 'Invoices'],
      description: 'For small cold storages',
    },
    {
      name: 'Professional',
      code: 'PROFESSIONAL',
      price: 9999,
      billingCycle: 'monthly',
      maxUsers: 30,
      maxChambers: 15,
      maxStorage: 10000,
      maxCustomers: 1000,
      features: ['Masters', 'Inventory', 'Billing', 'Reports', 'Gate'],
      description: 'For growing operations',
    },
    {
      name: 'Enterprise',
      code: 'ENTERPRISE',
      price: 24999,
      billingCycle: 'monthly',
      maxUsers: 100,
      maxChambers: 50,
      maxStorage: 50000,
      maxCustomers: 10000,
      features: ['All modules', 'Priority support', 'Custom rental rules'],
      description: 'For large multi-chamber facilities',
    },
  ];
  for (const plan of plans) {
    await PlanModel.updateOne({ code: plan.code }, { $set: plan }, { upsert: true });
  }
}

async function seedSuperAdmin() {
  const role = await RoleModel.findOne({ code: ROLE_CODES.SUPER_ADMIN, companyId: null });
  if (!role) {
    throw new Error('Super admin role missing');
  }
  const email = env.SEED_SUPER_ADMIN_EMAIL.toLowerCase();
  const existing = await UserModel.findOne({ email });
  if (existing) {
    logger.info({ email }, 'Super admin already exists');
    return;
  }
  await UserModel.create({
    name: 'Platform Super Admin',
    email,
    mobile: '9999999999',
    passwordHash: await bcrypt.hash(env.SEED_SUPER_ADMIN_PASSWORD, env.BCRYPT_SALT_ROUNDS),
    roleId: role._id,
    roleCode: ROLE_CODES.SUPER_ADMIN,
    companyId: null,
    status: 'active',
  });
  logger.info({ email }, 'Super admin created');
}

async function seedDemoCompany() {
  const existing = await CompanyModel.findOne({ email: 'demo@abccold.test', deletedAt: null });
  if (existing) {
    logger.info('Demo company already exists');
    return;
  }

  const plan = await PlanModel.findOne({ code: 'PROFESSIONAL' });
  const company = await CompanyModel.create({
    name: 'ABC Cold Storage',
    legalName: 'ABC Cold Storage Pvt Ltd',
    ownerName: 'Ramesh Kumar',
    mobile: '9876543210',
    email: 'demo@abccold.test',
    gstin: '',
    pan: '',
    address: { line1: 'Industrial Area', city: 'Agra', state: 'Uttar Pradesh', pincode: '282001' },
    storageCapacity: 12000,
    capacityUnit: 'MT',
    chamberCount: 5,
    planId: plan?._id ?? null,
    status: 'active',
    onboardingCompleted: false,
  });

  await createCompanyRoles(String(company._id));
  await SettingsModel.updateOne({ companyId: company._id }, { $set: { scope: 'company' } }, { upsert: true });

  const passwordHash = await bcrypt.hash('ChangeMe123!', env.BCRYPT_SALT_ROUNDS);
  const roleUsers: Array<{ code: string; name: string; email: string }> = [
    { code: ROLE_CODES.COMPANY_ADMIN, name: 'Company Admin', email: 'admin@abccold.test' },
    { code: ROLE_CODES.MANAGER, name: 'Operations Manager', email: 'manager@abccold.test' },
    { code: ROLE_CODES.ACCOUNTANT, name: 'Accountant', email: 'accounts@abccold.test' },
    { code: ROLE_CODES.WAREHOUSE_STAFF, name: 'Warehouse Staff', email: 'warehouse@abccold.test' },
    { code: ROLE_CODES.GATE_STAFF, name: 'Security Staff', email: 'gate@abccold.test' },
  ];

  for (const item of roleUsers) {
    const role = await RoleModel.findOne({ companyId: company._id, code: item.code });
    if (!role) continue;
    await UserModel.create({
      name: item.name,
      email: item.email,
      mobile: '9000000000',
      passwordHash,
      roleId: role._id,
      roleCode: item.code,
      companyId: company._id,
      status: 'active',
    });
  }

  logger.info({ company: company.name }, 'Demo company seeded');
}

async function seedOperationalData() {
  const company = await CompanyModel.findOne({ email: 'demo@abccold.test', deletedAt: null });
  if (!company) return;
  const existingCustomers = await CustomerModel.countDocuments({ companyId: company._id, deletedAt: null });
  if (existingCustomers > 0) {
    logger.info('Demo operational data already exists');
    return;
  }

  const admin = await UserModel.findOne({ email: 'admin@abccold.test', companyId: company._id });
  if (!admin) {
    throw new Error('Demo admin missing');
  }

  const actor = {
    id: String(admin._id),
    email: admin.email,
    name: admin.name,
    role: admin.roleCode,
    companyId: String(company._id),
    permissions: [] as string[],
    isSuperAdmin: false,
  };

  const companyId = String(company._id);
  const kg = await unitService.create(companyId, { name: 'Kilogram', code: 'KG' }, actor);
  const mt = await unitService.create(companyId, { name: 'Metric Ton', code: 'MT' }, actor);
  await unitService.create(companyId, { name: 'Bag', code: 'BAG' }, actor);
  const veg = await categoryService.create(companyId, { name: 'Frozen Vegetables', code: 'VEG' }, actor);
  await categoryService.create(companyId, { name: 'Dairy', code: 'DRY' }, actor);
  const peas = await productService.create(
    companyId,
    { name: 'Frozen Peas', code: 'PEAS', categoryId: veg._id, unitId: mt._id, storageType: 'Frozen' },
    actor,
  );
  await productService.create(
    companyId,
    { name: 'Butter', code: 'BUTTER', categoryId: veg._id, unitId: kg._id, storageType: 'Chilled' },
    actor,
  );
  const customer = await customerService.create(
    companyId,
    { name: 'FreshMart Traders', mobile: '9811111111', city: 'Agra', state: 'Uttar Pradesh' },
    actor,
  );
  await customerService.create(companyId, { name: 'Green Valley Foods', mobile: '9822222222', city: 'Mathura' }, actor);
  await supplierService.create(companyId, { name: 'Himalaya Frozen Foods', mobile: '9833333333' }, actor);

  const chamber = await createChamber(companyId, { name: 'Cold Chamber 1', code: 'C01', capacity: 4000, temperature: -18 }, actor);
  const chamberTwo = await createChamber(companyId, { name: 'Cold Chamber 2', code: 'C02', capacity: 3000, temperature: -22 }, actor);
  const rack = await createRack(companyId, { name: 'Rack 1', code: 'R01', chamberId: chamber._id, capacity: 2000 }, actor);
  const rackTwo = await createRack(companyId, { name: 'Rack 1', code: 'R01', chamberId: chamberTwo._id, capacity: 1500 }, actor);
  const location = await createLocation(companyId, { chamberId: chamber._id, rackId: rack._id, section: 'S01', capacity: 1000 }, actor);
  await createLocation(companyId, { chamberId: chamber._id, rackId: rack._id, section: 'S02', capacity: 1000 }, actor);
  await createLocation(companyId, { chamberId: chamberTwo._id, rackId: rackTwo._id, section: 'S01', capacity: 800 }, actor);

  await createOpeningStock(
    companyId,
    {
      customerId: String(customer._id),
      productId: String(peas._id),
      chamberId: String(chamber._id),
      rackId: String(rack._id),
      locationId: String(location._id),
      quantity: 250,
      unit: 'MT',
      batchNumber: 'OPEN-PEAS-01',
      notes: 'Opening stock',
    },
    actor,
  );
  await createInward(
    companyId,
    {
      customerId: String(customer._id),
      productId: String(peas._id),
      chamberId: String(chamber._id),
      rackId: String(rack._id),
      locationId: String(location._id),
      quantity: 50,
      unit: 'MT',
      vehicleNumber: 'UP80 AB 1234',
      batchNumber: 'INW-PEAS-02',
      notes: 'Demo inward',
    },
    actor,
  );
  logger.info('Demo operational data seeded');
}

export async function runSeed() {
  await seedPermissions();
  await seedPlatformRole();
  await seedPlans();
  await seedSuperAdmin();
  await seedDemoCompany();
  await seedOperationalData();
  logger.info('Seed completed');
}

async function main() {
  await connectDatabase();
  await runSeed();
  await disconnectDatabase();
}

if (isMainModule(import.meta.url)) {
  main().catch(async (err) => {
    logger.error({ err }, 'Seed failed');
    await disconnectDatabase();
    process.exit(1);
  });
}
