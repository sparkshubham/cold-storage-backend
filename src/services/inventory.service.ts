import type { ClientSession } from 'mongoose';
import { InventoryModel } from '../models/Inventory.js';
import { StockTransactionModel } from '../models/StockTransaction.js';
import { BatchModel } from '../models/Batch.js';
import { ChamberModel } from '../models/Chamber.js';
import { RackModel } from '../models/Rack.js';
import { LocationModel } from '../models/Location.js';
import { InwardModel } from '../models/Inward.js';
import { OutwardModel } from '../models/Outward.js';
import { CustomerModel } from '../models/Customer.js';
import { ProductModel } from '../models/Product.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { escapeRegex } from '../utils/pagination.js';
import { nextCode } from '../utils/codes.js';
import { withTransaction } from '../utils/transaction.js';
import { applyOccupancyDelta, applyQuantityDelta } from '../utils/stockMath.js';
import type { AuthUser } from '../types/auth.js';
import type { ListParams } from './tenantCrud.js';

function mapStockError(err: unknown, inbound: boolean): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'NEGATIVE_QUANTITY') throw AppError.badRequest('Insufficient stock for this movement');
  if (message === 'NEGATIVE_OCCUPANCY') throw AppError.badRequest('Occupancy cannot be negative');
  if (message === 'CAPACITY_EXCEEDED') {
    throw AppError.badRequest(inbound ? 'Not enough chamber/location capacity' : 'Capacity update failed');
  }
  throw err;
}

async function createDocs(
  model: { create: (docs: unknown[], options?: { session?: ClientSession }) => Promise<unknown> },
  docs: Array<Record<string, unknown>>,
  session?: ClientSession,
): Promise<any[]> {
  if (session) {
    return model.create(docs, { session }) as Promise<any[]>;
  }
  return model.create(docs) as Promise<any[]>;
}

async function applyOccupancy(companyId: string, locationId: string, delta: number, session?: ClientSession) {
  const location = await LocationModel.findOne({ _id: locationId, companyId, deletedAt: null }).session(session ?? null);
  if (!location) throw AppError.notFound('Location not found');
  const rack = await RackModel.findOne({ _id: location.rackId, companyId, deletedAt: null }).session(session ?? null);
  const chamber = await ChamberModel.findOne({ _id: location.chamberId, companyId, deletedAt: null }).session(session ?? null);
  if (!rack || !chamber) throw AppError.notFound('Storage location is incomplete');
  try {
    location.occupiedCapacity = applyOccupancyDelta(location.occupiedCapacity, delta, location.capacity);
    rack.occupiedCapacity = applyOccupancyDelta(rack.occupiedCapacity, delta, rack.capacity);
    chamber.occupiedCapacity = applyOccupancyDelta(chamber.occupiedCapacity, delta, chamber.capacity);
  } catch (err) {
    mapStockError(err, delta > 0);
  }
  await location.save({ session });
  await rack.save({ session });
  await chamber.save({ session });
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
    referenceType?: string;
    referenceId?: string;
    referenceNumber?: string;
    notes?: string;
    actor: AuthUser;
  },
  session?: ClientSession,
) {
  const delta = ['OUTWARD', 'TRANSFER_OUT', 'ADJUSTMENT_OUT', 'DAMAGE'].includes(input.type)
    ? -Math.abs(input.quantity)
    : Math.abs(input.quantity);
  const batchId = input.batchId || null;

  const location = await LocationModel.findOne({
    _id: input.locationId,
    companyId: input.companyId,
    deletedAt: null,
  }).session(session ?? null);
  if (!location) throw AppError.notFound('Location not found');
  const chamberId = String(location.chamberId);
  const rackId = String(location.rackId);

  const baseFilter = {
    companyId: input.companyId,
    customerId: input.customerId,
    productId: input.productId,
    locationId: input.locationId,
    status: 'available',
    deletedAt: null,
  };

  let inventory =
    delta > 0
      ? await InventoryModel.findOne({ ...baseFilter, batchId }).session(session ?? null)
      : await InventoryModel.findOne({
          ...baseFilter,
          ...(batchId ? { batchId } : {}),
          quantity: { $gte: Math.abs(delta) },
        }).session(session ?? null);

  if (!inventory && delta < 0) {
    inventory = await InventoryModel.findOne({
      ...baseFilter,
      ...(batchId ? { batchId } : {}),
    }).session(session ?? null);
  }

  if (!inventory) {
    if (delta < 0) throw AppError.badRequest('No stock exists at this location');
    inventory = new InventoryModel({
      ...baseFilter,
      batchId,
      chamberId,
      rackId,
      quantity: 0,
      reservedQuantity: 0,
      unit: input.unit,
      createdBy: input.actor.id,
    });
  }

  try {
    inventory.quantity = applyQuantityDelta(inventory.quantity, delta);
  } catch (err) {
    mapStockError(err, delta > 0);
  }
  inventory.unit = input.unit;
  inventory.updatedBy = input.actor.id as unknown as typeof inventory.updatedBy;
  await inventory.save({ session });
  await applyOccupancy(input.companyId, input.locationId, delta, session);

  const [transaction] = await createDocs(
    StockTransactionModel,
    [
      {
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
    ],
    session,
  );

  return { inventory, transaction };
}

async function assertMasters(companyId: string, customerId: string, productId: string) {
  const [customer, product] = await Promise.all([
    CustomerModel.findOne({ _id: customerId, companyId, deletedAt: null }),
    ProductModel.findOne({ _id: productId, companyId, deletedAt: null }),
  ]);
  if (!customer) throw AppError.notFound('Customer not found');
  if (!product) throw AppError.notFound('Product not found');
  return { customer, product };
}

export async function listInventory(
  companyId: string,
  params: ListParams & { customerId?: string; productId?: string; chamberId?: string },
) {
  const filter: Record<string, unknown> = { companyId, deletedAt: null };
  if (params.customerId) filter.customerId = params.customerId;
  if (params.productId) filter.productId = params.productId;
  if (params.chamberId) filter.chamberId = params.chamberId;
  if (params.status) filter.status = params.status;
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ unit: rx }];
  }
  const [data, total] = await Promise.all([
    InventoryModel.find(filter)
      .populate('customerId', 'name code')
      .populate('productId', 'name code')
      .populate('batchId', 'batchNumber lotNumber expiryDate')
      .populate('chamberId', 'name code')
      .populate('rackId', 'name code')
      .populate('locationId', 'code')
      .sort({ [params.sortBy]: params.sortOrder })
      .skip(params.skip)
      .limit(params.limit),
    InventoryModel.countDocuments(filter),
  ]);
  return { data, total };
}

export async function listStockTransactions(companyId: string, params: ListParams & { productId?: string; type?: string }) {
  const filter: Record<string, unknown> = { companyId };
  if (params.productId) filter.productId = params.productId;
  if (params.type) filter.type = params.type;
  const [data, total] = await Promise.all([
    StockTransactionModel.find(filter)
      .populate('customerId', 'name code')
      .populate('productId', 'name code')
      .populate('locationId', 'code')
      .sort({ createdAt: -1 })
      .skip(params.skip)
      .limit(params.limit),
    StockTransactionModel.countDocuments(filter),
  ]);
  return { data, total };
}

async function maybeCreateBatch(
  companyId: string,
  input: Record<string, unknown>,
  actor: AuthUser,
  inwardDate: Date,
  session?: ClientSession,
) {
  if (!input.batchNumber) return (input.batchId as string | undefined) ?? null;
  const [batch] = await createDocs(
    BatchModel,
    [
      {
        companyId,
        batchNumber: String(input.batchNumber).toUpperCase(),
        lotNumber: input.lotNumber ?? '',
        customerId: input.customerId,
        productId: input.productId,
        quantity: Number(input.quantity),
        inwardDate,
        manufacturingDate: input.manufacturingDate ?? null,
        expiryDate: input.expiryDate ?? null,
        chamberId: input.chamberId,
        rackId: input.rackId,
        locationId: input.locationId,
        createdBy: actor.id,
      },
    ],
    session,
  );
  return String(batch._id);
}

export async function createOpeningStock(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  await assertMasters(companyId, String(input.customerId), String(input.productId));
  return withTransaction(async (session) => {
    const batchId = await maybeCreateBatch(companyId, input, actor, input.inwardDate ? new Date(String(input.inwardDate)) : new Date(), session);
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
      session,
    );
    await writeAudit({
      companyId,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE',
      module: 'Inventory',
      recordId: String(result.inventory._id),
      recordLabel: 'Opening stock',
    });
    return result;
  });
}

export async function listInwards(companyId: string, params: ListParams) {
  const filter: Record<string, unknown> = { companyId, deletedAt: null };
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ inwardNumber: rx }, { vehicleNumber: rx }];
  }
  const [data, total] = await Promise.all([
    InwardModel.find(filter)
      .populate('customerId', 'name code')
      .populate('productId', 'name code')
      .populate('locationId', 'code')
      .sort({ createdAt: -1 })
      .skip(params.skip)
      .limit(params.limit),
    InwardModel.countDocuments(filter),
  ]);
  return { data, total };
}

export async function createInward(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  await assertMasters(companyId, String(input.customerId), String(input.productId));
  const inwardNumber = await nextCode(InwardModel, companyId, 'INW', 'inwardNumber');
  return withTransaction(async (session) => {
    const [inward] = await createDocs(
      InwardModel,
      [
        {
          customerId: input.customerId,
          productId: input.productId,
          quantity: Number(input.quantity),
          unit: input.unit,
          chamberId: input.chamberId,
          rackId: input.rackId,
          locationId: input.locationId,
          vehicleNumber: input.vehicleNumber ?? '',
          notes: input.notes ?? '',
          inwardNumber,
          companyId,
          date: input.date ? new Date(String(input.date)) : new Date(),
          status: 'completed',
          createdBy: actor.id,
        },
      ],
      session,
    );
    const batchId = await maybeCreateBatch(companyId, input, actor, inward.date, session);
    if (batchId) {
      inward.batchId = batchId as typeof inward.batchId;
      await inward.save({ session });
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
        referenceId: String(inward._id),
        referenceNumber: inward.inwardNumber,
        notes: input.notes ? String(input.notes) : undefined,
        actor,
      },
      session,
    );
    await writeAudit({
      companyId,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE',
      module: 'Inward',
      recordId: String(inward._id),
      recordLabel: inward.inwardNumber,
    });
    return inward;
  });
}

export async function listOutwards(companyId: string, params: ListParams) {
  const filter: Record<string, unknown> = { companyId, deletedAt: null };
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ outwardNumber: rx }, { vehicleNumber: rx }];
  }
  const [data, total] = await Promise.all([
    OutwardModel.find(filter)
      .populate('customerId', 'name code')
      .populate('productId', 'name code')
      .populate('locationId', 'code')
      .sort({ createdAt: -1 })
      .skip(params.skip)
      .limit(params.limit),
    OutwardModel.countDocuments(filter),
  ]);
  return { data, total };
}

export async function createOutward(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  await assertMasters(companyId, String(input.customerId), String(input.productId));
  const outwardNumber = await nextCode(OutwardModel, companyId, 'OUT', 'outwardNumber');
  return withTransaction(async (session) => {
    const [outward] = await createDocs(
      OutwardModel,
      [
        {
          customerId: input.customerId,
          productId: input.productId,
          quantity: Number(input.quantity),
          unit: input.unit,
          batchId: input.batchId ?? null,
          chamberId: input.chamberId,
          rackId: input.rackId,
          locationId: input.locationId,
          vehicleNumber: input.vehicleNumber ?? '',
          notes: input.notes ?? '',
          outwardNumber,
          companyId,
          date: input.date ? new Date(String(input.date)) : new Date(),
          status: 'completed',
          createdBy: actor.id,
        },
      ],
      session,
    );
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
        referenceId: String(outward._id),
        referenceNumber: outward.outwardNumber,
        notes: input.notes ? String(input.notes) : undefined,
        actor,
      },
      session,
    );
    await writeAudit({
      companyId,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE',
      module: 'Outward',
      recordId: String(outward._id),
      recordLabel: outward.outwardNumber,
    });
    return outward;
  });
}

export async function createAdjustment(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  await assertMasters(companyId, String(input.customerId), String(input.productId));
  const quantity = Number(input.quantity);
  if (!quantity) throw AppError.badRequest('Adjustment quantity cannot be zero');
  return withTransaction(async (session) =>
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
      session,
    ),
  );
}
