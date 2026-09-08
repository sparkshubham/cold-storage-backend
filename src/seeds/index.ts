import '../config/loadEnv.js';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { PERMISSIONS, ROLE_CODES } from '../config/constants.js';
import { SYSTEM_ROLES } from '../config/roles.js';
import { prisma } from '../db/prisma.js';
import { companyAddressFields, notDeleted } from '../db/serialize.js';
import { logger } from '../utils/logger.js';
import { createCompanyRoles } from '../services/company.service.js';
import { categoryService, customerService, productService, supplierService, unitService } from '../services/master.service.js';
import { createChamber, createLocation, createPillar, createRack } from '../services/storage.service.js';
import { createInward, createOpeningStock } from '../services/inventory.service.js';
import type { AuthUser } from '../types/auth.js';

async function seedPermissions() {
  for (const key of PERMISSIONS) {
    const [module, action] = key.split('.');
    await prisma.permission.upsert({
      where: { key },
      create: { key, module, action, description: key },
      update: { module, action, description: key },
    });
  }
}

export async function syncSystemRoles() {
  for (const template of SYSTEM_ROLES) {
    await prisma.role.updateMany({
      where: { code: template.code, isSystem: true, deletedAt: null },
      data: {
        permissionKeys: template.permissionKeys,
        name: template.name,
        description: template.description,
      },
    });
  }
}

/** Keep permission catalog + system role keys current without re-seeding demo data. */
export async function syncAccessControl() {
  await seedPermissions();
  await seedPlatformRole();
  await syncSystemRoles();
  logger.info('Access control synced (permissions + system roles)');
}

async function ensureUnit(
  companyId: string,
  input: { name: string; code: string },
  actor: AuthUser,
) {
  const existing = await prisma.unit.findFirst({
    where: notDeleted({ companyId, code: input.code.toUpperCase() }),
  });
  if (existing) return existing;
  return unitService.create(companyId, input, actor);
}

async function ensureDemoUnits() {
  const company = await prisma.company.findFirst({ where: notDeleted({ email: 'demo@abccold.test' }) });
  const admin = company
    ? await prisma.user.findFirst({ where: { email: 'admin@abccold.test', companyId: company.id } })
    : null;
  if (!company || !admin) return;
  const actor: AuthUser = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.roleCode,
    companyId: company.id,
    permissions: [],
    isSuperAdmin: false,
  };
  const extras = [
    { name: 'Numbers', code: 'NOS' },
    { name: 'Box', code: 'BOX' },
    { name: 'Tin', code: 'TIN' },
    { name: 'Bag', code: 'BAG' },
    { name: 'Bags', code: 'BAGS' },
    { name: 'Kilogram', code: 'KG' },
    { name: 'Metric Ton', code: 'MT' },
  ];
  for (const unit of extras) {
    await ensureUnit(company.id, unit, actor);
  }
}

async function seedPlatformRole() {
  const superAdmin = SYSTEM_ROLES.find((r) => r.code === ROLE_CODES.SUPER_ADMIN)!;
  const existing = await prisma.role.findFirst({
    where: { code: superAdmin.code, companyId: null },
  });
  if (existing) {
    await prisma.role.update({
      where: { id: existing.id },
      data: {
        name: superAdmin.name,
        description: superAdmin.description,
        isSystem: true,
        permissionKeys: superAdmin.permissionKeys,
        companyId: null,
      },
    });
    return;
  }
  await prisma.role.create({
    data: {
      name: superAdmin.name,
      code: superAdmin.code,
      description: superAdmin.description,
      isSystem: true,
      permissionKeys: superAdmin.permissionKeys,
      companyId: null,
    },
  });
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
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: plan,
    });
  }
}

async function seedSuperAdmin() {
  const role = await prisma.role.findFirst({ where: { code: ROLE_CODES.SUPER_ADMIN, companyId: null } });
  if (!role) {
    throw new Error('Super admin role missing');
  }
  const email = env.SEED_SUPER_ADMIN_EMAIL.toLowerCase();
  const existing = await prisma.user.findFirst({ where: { email } });
  const passwordHash = await bcrypt.hash(env.SEED_SUPER_ADMIN_PASSWORD, env.BCRYPT_SALT_ROUNDS);
  if (existing) {
    const matches = existing.passwordHash
      ? await bcrypt.compare(env.SEED_SUPER_ADMIN_PASSWORD, existing.passwordHash)
      : false;
    if (!matches || existing.status !== 'active' || existing.deletedAt) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          roleId: role.id,
          roleCode: ROLE_CODES.SUPER_ADMIN,
          status: 'active',
          deletedAt: null,
          companyId: null,
        },
      });
      logger.info({ email }, 'Super admin password reset');
    } else {
      logger.info({ email }, 'Super admin ready');
    }
    return;
  }
  await prisma.user.create({
    data: {
      name: 'Platform Super Admin',
      email,
      mobile: '9999999999',
      passwordHash,
      roleId: role.id,
      roleCode: ROLE_CODES.SUPER_ADMIN,
      companyId: null,
      status: 'active',
    },
  });
  logger.info({ email }, 'Super admin created');
}

async function seedDemoCompany() {
  const plan = await prisma.plan.findFirst({ where: { code: 'PROFESSIONAL' } });
  let company = await prisma.company.findFirst({ where: { email: 'demo@abccold.test' } });
  const companyData = {
    name: 'ABC Cold Storage',
    legalName: 'ABC Cold Storage Pvt Ltd',
    ownerName: 'Ramesh Kumar',
    mobile: '9876543210',
    email: 'demo@abccold.test',
    gstin: '',
    pan: '',
    ...companyAddressFields({ line1: 'Industrial Area', city: 'Agra', state: 'Uttar Pradesh', pincode: '282001' }),
    storageCapacity: 12000,
    capacityUnit: 'MT',
    chamberCount: 5,
    planId: plan?.id ?? null,
    status: 'active',
    deletedAt: null,
    onboardingCompleted: false,
  };
  if (company) {
    company = await prisma.company.update({ where: { id: company.id }, data: companyData });
  } else {
    company = await prisma.company.create({ data: companyData });
  }

  const roleCount = await prisma.role.count({ where: notDeleted({ companyId: company.id }) });
  if (roleCount === 0) {
    await createCompanyRoles(company.id);
  }
  await prisma.settings.upsert({
    where: { companyId: company.id },
    create: {
      companyId: company.id,
      scope: 'company',
      handlingChargeBasis: 'weight',
      handlingWeightUnit: 'KG',
    },
    update: { scope: 'company', handlingChargeBasis: 'weight', handlingWeightUnit: 'KG' },
  });

  const passwordHash = await bcrypt.hash('ChangeMe123!', env.BCRYPT_SALT_ROUNDS);
  const roleUsers: Array<{ code: string; name: string; email: string }> = [
    { code: ROLE_CODES.COMPANY_ADMIN, name: 'Company Admin', email: 'admin@abccold.test' },
    { code: ROLE_CODES.MANAGER, name: 'Operations Manager', email: 'manager@abccold.test' },
    { code: ROLE_CODES.ACCOUNTANT, name: 'Accountant', email: 'accounts@abccold.test' },
    { code: ROLE_CODES.WAREHOUSE_STAFF, name: 'Warehouse Staff', email: 'warehouse@abccold.test' },
    { code: ROLE_CODES.GATE_STAFF, name: 'Security Staff', email: 'gate@abccold.test' },
  ];

  for (const item of roleUsers) {
    const role = await prisma.role.findFirst({ where: { companyId: company.id, code: item.code } });
    if (!role) continue;
    const existingUser = await prisma.user.findFirst({ where: { email: item.email } });
    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          roleId: role.id,
          roleCode: item.code,
          companyId: company.id,
          status: 'active',
          deletedAt: null,
        },
      });
      continue;
    }
    await prisma.user.create({
      data: {
        name: item.name,
        email: item.email,
        mobile: '9000000000',
        passwordHash,
        roleId: role.id,
        roleCode: item.code,
        companyId: company.id,
        status: 'active',
      },
    });
  }

  logger.info({ company: company.name }, 'Demo company seeded');
}

/** Wipe demo-tenant operational rows so seed can recreate masters/stock. */
async function resetDemoOperationalData(companyId: string) {
  // Delete in FK-safe order (no onDelete: Cascade on these relations).
  await prisma.stockTransaction.deleteMany({ where: { companyId } });
  await prisma.inventory.deleteMany({ where: { companyId } });
  await prisma.inward.deleteMany({ where: { companyId } });
  await prisma.outward.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { companyId } });
  await prisma.batch.deleteMany({ where: { companyId } });
  await prisma.location.deleteMany({ where: { companyId } });
  await prisma.pillar.deleteMany({ where: { companyId } });
  await prisma.rack.deleteMany({ where: { companyId } });
  await prisma.chamber.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.category.deleteMany({ where: { companyId } });
  await prisma.unit.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.supplier.deleteMany({ where: { companyId } });
  logger.info({ companyId }, 'Demo operational data reset');
}

async function seedOperationalData(force = false) {
  const company = await prisma.company.findFirst({ where: notDeleted({ email: 'demo@abccold.test' }) });
  if (!company) return;
  const existingCustomers = await prisma.customer.count({ where: notDeleted({ companyId: company.id }) });
  if (existingCustomers > 0 && !force) {
    logger.info('Demo operational data already exists (pass --force or SEED_FORCE=1 to recreate)');
    return;
  }
  if (force && existingCustomers > 0) {
    await resetDemoOperationalData(company.id);
  }

  const admin = await prisma.user.findFirst({ where: { email: 'admin@abccold.test', companyId: company.id } });
  if (!admin) {
    logger.warn('Demo admin missing; skipping operational seed');
    return;
  }

  const actor: AuthUser = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.roleCode,
    companyId: company.id,
    permissions: [],
    isSuperAdmin: false,
  };

  const companyId = company.id;
  const rowId = (doc: unknown) => String((doc as { _id?: string; id?: string })._id ?? (doc as { id?: string }).id);
  const kg = await ensureUnit(companyId, { name: 'Kilogram', code: 'KG' }, actor);
  const mt = await ensureUnit(companyId, { name: 'Metric Ton', code: 'MT' }, actor);
  await ensureUnit(companyId, { name: 'Bag', code: 'BAG' }, actor);
  await ensureUnit(companyId, { name: 'Bags', code: 'BAGS' }, actor);
  await ensureUnit(companyId, { name: 'Numbers', code: 'NOS' }, actor);
  await ensureUnit(companyId, { name: 'Box', code: 'BOX' }, actor);
  await ensureUnit(companyId, { name: 'Tin', code: 'TIN' }, actor);
  const veg = await categoryService.create(companyId, { name: 'Frozen Vegetables', code: 'VEG' }, actor);
  await categoryService.create(companyId, { name: 'Dairy', code: 'DRY' }, actor);
  const peas = await productService.create(
    companyId,
    {
      name: 'Frozen Peas',
      code: 'PEAS',
      categoryId: rowId(veg),
      unitId: rowId(mt),
      storageType: 'Frozen',
    },
    actor,
  );
  await productService.create(
    companyId,
    {
      name: 'Butter',
      code: 'BUTTER',
      categoryId: rowId(veg),
      unitId: rowId(kg),
      storageType: 'Chilled',
    },
    actor,
  );
  const customer = await customerService.create(
    companyId,
    { name: 'FreshMart Traders', mobile: '9811111111', city: 'Agra', state: 'Uttar Pradesh' },
    actor,
  );
  await customerService.create(companyId, { name: 'Green Valley Foods', mobile: '9822222222', city: 'Mathura' }, actor);
  await supplierService.create(companyId, { name: 'Himalaya Frozen Foods', mobile: '9833333333' }, actor);

  const chamber = await createChamber(
    companyId,
    { name: 'Cold Chamber 1', code: 'C01', capacity: 4000, temperature: -18 },
    actor,
  );
  const chamberTwo = await createChamber(
    companyId,
    { name: 'Cold Chamber 2', code: 'C02', capacity: 3000, temperature: -22 },
    actor,
  );
  const rack = await createRack(
    companyId,
    { name: 'Rack 1', code: 'R01', chamberId: rowId(chamber), capacity: 2000 },
    actor,
  );
  const rackTwo = await createRack(
    companyId,
    { name: 'Rack 1', code: 'R01', chamberId: rowId(chamberTwo), capacity: 1500 },
    actor,
  );
  const pillar = await createPillar(
    companyId,
    {
      name: 'B-Pillar 1',
      code: 'B01',
      series: 'B',
      chamberId: rowId(chamber),
      rackId: rowId(rack),
      capacity: 1000,
    },
    actor,
  );
  await createPillar(
    companyId,
    {
      name: 'B-Pillar 2',
      code: 'B02',
      series: 'B',
      chamberId: rowId(chamberTwo),
      rackId: rowId(rackTwo),
      capacity: 800,
    },
    actor,
  );
  const location = await createLocation(
    companyId,
    {
      chamberId: rowId(chamber),
      rackId: rowId(rack),
      pillarId: rowId(pillar),
      section: 'S01',
      capacity: 1000,
    },
    actor,
  );
  await createLocation(
    companyId,
    { chamberId: rowId(chamber), rackId: rowId(rack), section: 'S02', capacity: 1000 },
    actor,
  );
  await createLocation(
    companyId,
    { chamberId: rowId(chamberTwo), rackId: rowId(rackTwo), section: 'S01', capacity: 800 },
    actor,
  );

  await createOpeningStock(
    companyId,
    {
      customerId: rowId(customer),
      productId: rowId(peas),
      chamberId: rowId(chamber),
      rackId: rowId(rack),
      locationId: rowId(location),
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
      customerId: rowId(customer),
      productId: rowId(peas),
      chamberId: rowId(chamber),
      rackId: rowId(rack),
      locationId: rowId(location),
      quantity: 50,
      unit: 'MT',
      weight: 50000,
      weightUnit: 'KG',
      vehicleNumber: 'UP80 AB 1234',
      batchNumber: 'INW-PEAS-02',
      notes: 'Demo inward',
    },
    actor,
  );
  logger.info('Demo operational data seeded');
}

export async function runSeed(options: { force?: boolean } = {}) {
  const force = Boolean(options.force || env.SEED_FORCE);
  await seedPermissions();
  await seedPlatformRole();
  await syncSystemRoles();
  await seedPlans();
  await seedSuperAdmin();
  await seedDemoCompany();
  try {
    await ensureDemoUnits();
    await seedOperationalData(force);
  } catch (err) {
    logger.error({ err }, 'Operational seed failed; login accounts were still created');
    throw err;
  }
  logger.info({ force }, 'Seed completed');
}
