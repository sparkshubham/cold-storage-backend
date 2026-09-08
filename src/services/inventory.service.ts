import { prisma } from '../db/prisma.js';
import { notDeleted, orderField, serialize, withPopulated } from '../db/serialize.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { nextCode } from '../utils/codes.js';
import { withTransaction, type DbClient } from '../utils/transaction.js';
import { applyOccupancyDelta, applyQuantityDelta } from '../utils/stockMath.js';
import type { AuthUser } from '../types/auth.js';
import type { ListParams } from './tenantCrud.js';

type Db = DbClient;

function mapStockError(err: unknown, inbound: boolean): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'NEGATIVE_QUANTITY') throw AppError.badRequest('Insufficient stock for this movement');
  if (message === 'NEGATIVE_OCCUPANCY') throw AppError.badRequest('Occupancy cannot be negative');
  if (message === 'CAPACITY_EXCEEDED') {
    throw AppError.badRequest(inbound ? 'Not enough chamber/location capacity' : 'Capacity update failed');
  }
  throw err;
}

async function applyOccupancy(companyId: string, locationId: string, delta: number, db: Db) {
  const location = await db.location.findFirst({ where: notDeleted({ id: locationId, companyId }) });
  if (!location) throw AppError.notFound('Location not found');
  const rack = await db.rack.findFirst({ where: notDeleted({ id: location.rackId, companyId }) });
  const chamber = await db.chamber.findFirst({ where: notDeleted({ id: location.chamberId, companyId }) });
  if (!rack || !chamber) throw AppError.notFound('Storage location is incomplete');
  let locationOccupied: number;
  let rackOccupied: number;
  let chamberOccupied: number;
  try {
    locationOccupied = applyOccupancyDelta(location.occupiedCapacity, delta, location.capacity);
    rackOccupied = applyOccupancyDelta(rack.occupiedCapacity, delta, rack.capacity);
    chamberOccupied = applyOccupancyDelta(chamber.occupiedCapacity, delta, chamber.capacity);
  } catch (err) {
    mapStockError(err, delta > 0);
  }
  await db.location.update({ where: { id: location.id }, data: { occupiedCapacity: locationOccupied! } });
  await Promise.all([
    db.rack.update({ where: { id: rack.id }, data: { occupiedCapacity: rackOccupied! } }),
    db.chamber.update({ where: { id: chamber.id }, data: { occupiedCapacity: chamberOccupied! } }),
  ]);
  return { location, rack, chamber };
}

export async function applyStockMovement(
  input: {
    companyId: string;
    type: 'OPENING' | 'INWARD' | 'OUTWARD' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'REVERSAL';
    customerId: string;
    productId: string;
    batchId?: string | null;
    chamberId?: string;
    rackId?: string;
    locationId: string;
    quantity: number;
    unit: string;
    outbound?: boolean;
    referenceType?: string;
    referenceId?: string;
    referenceNumber?: string;
    notes?: string;
    actor: AuthUser;
  },
  db: Db = prisma,
) {
  const outboundByType = ['OUTWARD', 'TRANSFER_OUT', 'ADJUSTMENT_OUT', 'DAMAGE'].includes(input.type);
  const outbound = input.outbound ?? outboundByType;
  const delta = outbound ? -Math.abs(input.quantity) : Math.abs(input.quantity);
  const batchId = input.batchId || null;

  const location = await db.location.findFirst({
    where: notDeleted({ id: input.locationId, companyId: input.companyId }),
  });
  if (!location) throw AppError.notFound('Location not found');
  const chamberId = location.chamberId;
  const rackId = location.rackId;

  const baseWhere = {
    companyId: input.companyId,
    customerId: input.customerId,
    productId: input.productId,
    locationId: input.locationId,
    status: 'available',
    deletedAt: null as null,
    batchId,
  };

  let inventory =
    delta > 0
      ? await db.inventory.findFirst({ where: baseWhere })
      : await db.inventory.findFirst({
          where: {
            ...baseWhere,
            quantity: { gte: Math.abs(delta) },
          },
        });

  if (!inventory && delta < 0) {
    inventory = await db.inventory.findFirst({ where: baseWhere });
  }

  let inventoryId: string;
  let nextQty: number;

  if (!inventory) {
    if (delta < 0) throw AppError.badRequest('No stock exists at this location');
    try {
      nextQty = applyQuantityDelta(0, delta);
    } catch (err) {
      mapStockError(err, delta > 0);
    }
    const created = await db.inventory.create({
      data: {
        companyId: input.companyId,
        customerId: input.customerId,
        productId: input.productId,
        batchId,
        chamberId,
        rackId,
        locationId: input.locationId,
        quantity: nextQty!,
        reservedQuantity: 0,
        unit: input.unit,
        status: 'available',
        createdBy: input.actor.id,
      },
    });
    inventoryId = created.id;
    inventory = created;
  } else {
    try {
      nextQty = applyQuantityDelta(inventory.quantity, delta);
    } catch (err) {
      mapStockError(err, delta > 0);
    }
    inventory = await db.inventory.update({
      where: { id: inventory.id },
      data: { quantity: nextQty!, unit: input.unit, updatedBy: input.actor.id },
    });
    inventoryId = inventory.id;
  }

  await applyOccupancy(input.companyId, input.locationId, delta, db);

  const transaction = await db.stockTransaction.create({
    data: {
      companyId: input.companyId,
      type: input.type,
      customerId: input.customerId,
      productId: input.productId,
      batchId,
      chamberId,
      rackId,
      locationId: input.locationId,
      quantity: Math.abs(input.quantity),
      unit: input.unit,
      referenceType: input.referenceType ?? '',
      referenceId: input.referenceId ?? null,
      referenceNumber: input.referenceNumber ?? '',
      notes: input.notes ?? '',
      createdBy: input.actor.id,
    },
  });

  return {
    inventory: serialize(inventory),
    transaction: serialize(transaction),
  };
}

async function assertMasters(companyId: string, customerId: string, productId: string) {
  const [customer, product] = await Promise.all([
    prisma.customer.findFirst({ where: notDeleted({ id: customerId, companyId }) }),
    prisma.product.findFirst({ where: notDeleted({ id: productId, companyId }) }),
  ]);
  if (!customer) throw AppError.notFound('Customer not found');
  if (!product) throw AppError.notFound('Product not found');
  return { customer, product };
}

const inventoryPopulateMap = {
  customer: 'customerId',
  product: 'productId',
  batch: 'batchId',
  chamber: 'chamberId',
  rack: 'rackId',
  location: 'locationId',
};

const stockTxPopulateMap = {
  customer: 'customerId',
  product: 'productId',
  location: 'locationId',
};

const movementPopulateMap = {
  customer: 'customerId',
  product: 'productId',
  chamber: 'chamberId',
  rack: 'rackId',
  pillar: 'pillarId',
  location: 'locationId',
  batch: 'batchId',
  invoice: 'invoiceId',
};

const movementInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      code: true,
      mobile: true,
      email: true,
      gstin: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
    },
  },
  product: { select: { id: true, name: true, code: true, hsn: true, defaultRate: true, unitId: true } },
  chamber: { select: { id: true, name: true, code: true } },
  rack: { select: { id: true, name: true, code: true } },
  pillar: { select: { id: true, name: true, code: true, series: true } },
  location: { select: { id: true, code: true } },
  batch: { select: { id: true, batchNumber: true, lotNumber: true, inwardDate: true, expiryDate: true } },
  invoice: { select: { id: true, invoiceNumber: true, total: true, status: true, date: true } },
} as const;

export async function listInventory(
  companyId: string,
  params: ListParams & { customerId?: string; productId?: string; chamberId?: string },
) {
  const where: Record<string, unknown> = notDeleted({ companyId });
  if (params.customerId) where.customerId = params.customerId;
  if (params.productId) where.productId = params.productId;
  if (params.chamberId) where.chamberId = params.chamberId;
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [{ unit: { contains: params.search, mode: 'insensitive' } }];
  }
  const orderBy = { [orderField(params.sortBy)]: params.sortOrder === -1 ? 'desc' : 'asc' };
  const [rows, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      orderBy,
      skip: params.skip,
      take: params.limit,
      include: {
        customer: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, code: true } },
        batch: { select: { id: true, batchNumber: true, lotNumber: true, expiryDate: true } },
        chamber: { select: { id: true, name: true, code: true } },
        rack: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, code: true } },
      },
    }),
    prisma.inventory.count({ where }),
  ]);
  return {
    data: (rows as Record<string, unknown>[]).map((row) => withPopulated(row, inventoryPopulateMap)),
    total,
  };
}

export async function listStockTransactions(
  companyId: string,
  params: ListParams & { productId?: string; type?: string },
) {
  const where: Record<string, unknown> = { companyId };
  if (params.productId) where.productId = params.productId;
  if (params.type) where.type = params.type;
  const [rows, total] = await Promise.all([
    prisma.stockTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.limit,
      include: {
        customer: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, code: true } },
      },
    }),
    prisma.stockTransaction.count({ where }),
  ]);
  return {
    data: (rows as Record<string, unknown>[]).map((row) => withPopulated(row, stockTxPopulateMap)),
    total,
  };
}

async function maybeCreateBatch(
  companyId: string,
  input: Record<string, unknown>,
  actor: AuthUser,
  inwardDate: Date,
  db: Db,
) {
  if (!input.batchNumber) return (input.batchId as string | undefined) ?? null;
  const batch = await db.batch.create({
    data: {
      companyId,
      batchNumber: String(input.batchNumber).toUpperCase(),
      lotNumber: input.lotNumber != null ? String(input.lotNumber) : '',
      customerId: String(input.customerId),
      productId: String(input.productId),
      quantity: Number(input.quantity),
      inwardDate,
      manufacturingDate: input.manufacturingDate ? new Date(String(input.manufacturingDate)) : null,
      expiryDate: input.expiryDate ? new Date(String(input.expiryDate)) : null,
      chamberId: input.chamberId ? String(input.chamberId) : null,
      rackId: input.rackId ? String(input.rackId) : null,
      locationId: input.locationId ? String(input.locationId) : null,
      createdBy: actor.id,
    },
  });
  return batch.id;
}

export async function createOpeningStock(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  await assertMasters(companyId, String(input.customerId), String(input.productId));
  return withTransaction(async (tx) => {
    const batchId = await maybeCreateBatch(
      companyId,
      input,
      actor,
      input.inwardDate ? new Date(String(input.inwardDate)) : new Date(),
      tx,
    );
    const result = await applyStockMovement(
      {
        companyId,
        type: 'OPENING',
        customerId: String(input.customerId),
        productId: String(input.productId),
        batchId,
        locationId: String(input.locationId),
        quantity: Number(input.quantity),
        unit: String(input.unit),
        referenceType: 'opening',
        notes: input.notes ? String(input.notes) : undefined,
        actor,
      },
      tx,
    );
    await writeAudit({
      companyId,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE',
      module: 'Inventory',
      recordId: String((result.inventory as { _id?: unknown; id?: unknown })._id ?? (result.inventory as { id?: unknown }).id),
      recordLabel: 'Opening stock',
    });
    return result;
  });
}

export async function getInward(companyId: string, id: string) {
  const doc = await prisma.inward.findFirst({
    where: notDeleted({ id, companyId }),
    include: movementInclude,
  });
  if (!doc) throw AppError.notFound('Inward not found');
  return withPopulated(doc as unknown as Record<string, unknown>, movementPopulateMap);
}

export async function getOutward(companyId: string, id: string) {
  const doc = await prisma.outward.findFirst({
    where: notDeleted({ id, companyId }),
    include: movementInclude,
  });
  if (!doc) throw AppError.notFound('Outward not found');
  return withPopulated(doc as unknown as Record<string, unknown>, movementPopulateMap);
}

export async function listInwards(companyId: string, params: ListParams) {
  const where: Record<string, unknown> = notDeleted({ companyId });
  if (params.search) {
    where.OR = [
      { inwardNumber: { contains: params.search, mode: 'insensitive' } },
      { vehicleNumber: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.inward.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: params.skip,
      take: params.limit,
      include: {
        customer: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, code: true } },
        pillar: { select: { id: true, name: true, code: true } },
        invoice: { select: { id: true, invoiceNumber: true, total: true, status: true } },
      },
    }),
    prisma.inward.count({ where }),
  ]);
  return {
    data: (rows as Record<string, unknown>[]).map((row) =>
      withPopulated(row, {
        customer: 'customerId',
        product: 'productId',
        location: 'locationId',
        pillar: 'pillarId',
        invoice: 'invoiceId',
      }),
    ),
    total,
  };
}

export async function createInward(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  await assertMasters(companyId, String(input.customerId), String(input.productId));
  const inwardNumber = await nextCode(prisma.inward, companyId, 'INW', 'inwardNumber');
  return withTransaction(async (tx) => {
    const date = input.date ? new Date(String(input.date)) : new Date();
    let inward = await tx.inward.create({
      data: {
        customerId: String(input.customerId),
        productId: String(input.productId),
        quantity: Number(input.quantity),
        unit: String(input.unit),
        weight: Number(input.weight ?? 0),
        weightUnit: String(input.weightUnit || 'KG').toUpperCase(),
        challanNumber: String(input.challanNumber || inwardNumber).toUpperCase(),
        chamberId: String(input.chamberId),
        rackId: String(input.rackId),
        pillarId: input.pillarId ? String(input.pillarId) : null,
        locationId: String(input.locationId),
        vehicleNumber: input.vehicleNumber != null ? String(input.vehicleNumber) : '',
        notes: input.notes != null ? String(input.notes) : '',
        inwardNumber,
        companyId,
        date,
        status: 'completed',
        createdBy: actor.id,
      },
    });
    const batchId = await maybeCreateBatch(companyId, input, actor, inward.date, tx);
    if (batchId) {
      inward = await tx.inward.update({ where: { id: inward.id }, data: { batchId } });
    }
    await applyStockMovement(
      {
        companyId,
        type: 'INWARD',
        customerId: String(input.customerId),
        productId: String(input.productId),
        batchId,
        locationId: String(input.locationId),
        quantity: Number(input.quantity),
        unit: String(input.unit),
        referenceType: 'inward',
        referenceId: inward.id,
        referenceNumber: inward.inwardNumber,
        notes: input.notes ? String(input.notes) : undefined,
        actor,
      },
      tx,
    );
    await writeAudit({
      companyId,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE',
      module: 'Inward',
      recordId: inward.id,
      recordLabel: inward.inwardNumber,
    });
    return serialize(inward);
  });
}

export async function listOutwards(companyId: string, params: ListParams) {
  const where: Record<string, unknown> = notDeleted({ companyId });
  if (params.search) {
    where.OR = [
      { outwardNumber: { contains: params.search, mode: 'insensitive' } },
      { vehicleNumber: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.outward.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: params.skip,
      take: params.limit,
      include: {
        customer: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, code: true } },
        pillar: { select: { id: true, name: true, code: true } },
        invoice: { select: { id: true, invoiceNumber: true, total: true, status: true } },
      },
    }),
    prisma.outward.count({ where }),
  ]);
  return {
    data: (rows as Record<string, unknown>[]).map((row) =>
      withPopulated(row, {
        customer: 'customerId',
        product: 'productId',
        location: 'locationId',
        pillar: 'pillarId',
        invoice: 'invoiceId',
      }),
    ),
    total,
  };
}

export async function createOutward(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  await assertMasters(companyId, String(input.customerId), String(input.productId));
  const outwardNumber = await nextCode(prisma.outward, companyId, 'OUT', 'outwardNumber');
  return withTransaction(async (tx) => {
    const outward = await tx.outward.create({
      data: {
        customerId: String(input.customerId),
        productId: String(input.productId),
        quantity: Number(input.quantity),
        unit: String(input.unit),
        weight: Number(input.weight ?? 0),
        weightUnit: String(input.weightUnit || 'KG').toUpperCase(),
        challanNumber: String(input.challanNumber || outwardNumber).toUpperCase(),
        batchId: input.batchId ? String(input.batchId) : null,
        chamberId: String(input.chamberId),
        rackId: String(input.rackId),
        pillarId: input.pillarId ? String(input.pillarId) : null,
        locationId: String(input.locationId),
        vehicleNumber: input.vehicleNumber != null ? String(input.vehicleNumber) : '',
        notes: input.notes != null ? String(input.notes) : '',
        outwardNumber,
        companyId,
        date: input.date ? new Date(String(input.date)) : new Date(),
        status: 'completed',
        createdBy: actor.id,
      },
    });
    await applyStockMovement(
      {
        companyId,
        type: 'OUTWARD',
        customerId: String(input.customerId),
        productId: String(input.productId),
        batchId: input.batchId ? String(input.batchId) : null,
        locationId: String(input.locationId),
        quantity: Number(input.quantity),
        unit: String(input.unit),
        referenceType: 'outward',
        referenceId: outward.id,
        referenceNumber: outward.outwardNumber,
        notes: input.notes ? String(input.notes) : undefined,
        actor,
      },
      tx,
    );
    await writeAudit({
      companyId,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE',
      module: 'Outward',
      recordId: outward.id,
      recordLabel: outward.outwardNumber,
    });
    return serialize(outward);
  });
}

async function assertNotIssued(companyId: string, sourceType: 'inward' | 'outward', sourceId: string, db: Db) {
  const billed = await db.invoice.findFirst({
    where: notDeleted({ companyId, sourceType, sourceId, status: 'issued' }),
  });
  if (billed) {
    throw AppError.conflict(`Cancel bill ${billed.invoiceNumber} before cancelling this ${sourceType}`);
  }
}

export async function updateInward(companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) {
  const doc = await prisma.inward.findFirst({ where: notDeleted({ id, companyId }) });
  if (!doc) throw AppError.notFound('Inward not found');
  if (doc.status === 'cancelled') throw AppError.badRequest('Cancelled inward cannot be edited');
  const data: Record<string, unknown> = { updatedBy: actor.id };
  if (input.vehicleNumber != null) data.vehicleNumber = String(input.vehicleNumber);
  if (input.notes != null) data.notes = String(input.notes);
  if (input.date) data.date = new Date(String(input.date));
  if (input.challanNumber != null) data.challanNumber = String(input.challanNumber).toUpperCase();
  if (input.weight != null) data.weight = Number(input.weight);
  if (input.weightUnit != null) data.weightUnit = String(input.weightUnit).toUpperCase();
  await prisma.inward.update({ where: { id }, data });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Inward',
    recordId: id,
    recordLabel: doc.inwardNumber,
  });
  return getInward(companyId, id);
}

export async function updateOutward(companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) {
  const doc = await prisma.outward.findFirst({ where: notDeleted({ id, companyId }) });
  if (!doc) throw AppError.notFound('Outward not found');
  if (doc.status === 'cancelled') throw AppError.badRequest('Cancelled outward cannot be edited');
  const data: Record<string, unknown> = { updatedBy: actor.id };
  if (input.vehicleNumber != null) data.vehicleNumber = String(input.vehicleNumber);
  if (input.notes != null) data.notes = String(input.notes);
  if (input.date) data.date = new Date(String(input.date));
  if (input.challanNumber != null) data.challanNumber = String(input.challanNumber).toUpperCase();
  if (input.weight != null) data.weight = Number(input.weight);
  if (input.weightUnit != null) data.weightUnit = String(input.weightUnit).toUpperCase();
  await prisma.outward.update({ where: { id }, data });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Outward',
    recordId: id,
    recordLabel: doc.outwardNumber,
  });
  return getOutward(companyId, id);
}

export async function cancelInward(companyId: string, id: string, actor: AuthUser) {
  return withTransaction(async (tx) => {
    const doc = await tx.inward.findFirst({ where: notDeleted({ id, companyId }) });
    if (!doc) throw AppError.notFound('Inward not found');
    if (doc.status === 'cancelled') throw AppError.badRequest('This inward is already cancelled');
    await assertNotIssued(companyId, 'inward', id, tx);
    await applyStockMovement(
      {
        companyId,
        type: 'REVERSAL',
        outbound: true,
        customerId: doc.customerId,
        productId: doc.productId,
        batchId: doc.batchId,
        locationId: doc.locationId,
        quantity: Number(doc.quantity),
        unit: String(doc.unit),
        referenceType: 'inward',
        referenceId: doc.id,
        referenceNumber: doc.inwardNumber,
        notes: 'Cancelled inward',
        actor,
      },
      tx,
    );
    const updated = await tx.inward.update({
      where: { id },
      data: { status: 'cancelled', updatedBy: actor.id },
    });
    await writeAudit({
      companyId,
      userId: actor.id,
      userName: actor.name,
      action: 'DELETE',
      module: 'Inward',
      recordId: doc.id,
      recordLabel: doc.inwardNumber,
    });
    return serialize(updated);
  });
}

export async function cancelOutward(companyId: string, id: string, actor: AuthUser) {
  return withTransaction(async (tx) => {
    const doc = await tx.outward.findFirst({ where: notDeleted({ id, companyId }) });
    if (!doc) throw AppError.notFound('Outward not found');
    if (doc.status === 'cancelled') throw AppError.badRequest('This outward is already cancelled');
    await assertNotIssued(companyId, 'outward', id, tx);
    await applyStockMovement(
      {
        companyId,
        type: 'REVERSAL',
        outbound: false,
        customerId: doc.customerId,
        productId: doc.productId,
        batchId: doc.batchId,
        locationId: doc.locationId,
        quantity: Number(doc.quantity),
        unit: String(doc.unit),
        referenceType: 'outward',
        referenceId: doc.id,
        referenceNumber: doc.outwardNumber,
        notes: 'Cancelled outward',
        actor,
      },
      tx,
    );
    const updated = await tx.outward.update({
      where: { id },
      data: { status: 'cancelled', updatedBy: actor.id },
    });
    await writeAudit({
      companyId,
      userId: actor.id,
      userName: actor.name,
      action: 'DELETE',
      module: 'Outward',
      recordId: doc.id,
      recordLabel: doc.outwardNumber,
    });
    return serialize(updated);
  });
}

export async function createAdjustment(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  await assertMasters(companyId, String(input.customerId), String(input.productId));
  const quantity = Number(input.quantity);
  if (!quantity) throw AppError.badRequest('Adjustment quantity cannot be zero');
  return withTransaction(async (tx) =>
    applyStockMovement(
      {
        companyId,
        type: quantity >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        customerId: String(input.customerId),
        productId: String(input.productId),
        batchId: input.batchId ? String(input.batchId) : null,
        locationId: String(input.locationId),
        quantity: Math.abs(quantity),
        unit: String(input.unit),
        referenceType: 'adjustment',
        notes: String(input.notes || input.reason || ''),
        actor,
      },
      tx,
    ),
  );
}
