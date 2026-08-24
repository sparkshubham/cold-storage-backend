import { ChamberModel } from '../models/Chamber.js';
import { RackModel } from '../models/Rack.js';
import { LocationModel } from '../models/Location.js';
import { InventoryModel } from '../models/Inventory.js';
import { CompanyModel } from '../models/Company.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { escapeRegex } from '../utils/pagination.js';
import { nextCode } from '../utils/codes.js';
import { occupancyPercent } from '../utils/stockMath.js';
import type { AuthUser } from '../types/auth.js';
import type { ListParams } from './tenantCrud.js';

async function syncCompanyCapacity(companyId: string) {
  const chambers = await ChamberModel.find({ companyId, deletedAt: null });
  const total = chambers.reduce((sum, chamber) => sum + (chamber.capacity || 0), 0);
  await CompanyModel.updateOne(
    { _id: companyId },
    { $set: { storageCapacity: total, chamberCount: chambers.length } },
  );
}

function occupancy<T extends { occupiedCapacity?: number; capacity?: number }>(doc: T) {
  return {
    ...doc,
    availableCapacity: Number(doc.capacity ?? 0) - Number(doc.occupiedCapacity ?? 0),
    occupancyPercent: occupancyPercent(doc.occupiedCapacity ?? 0, doc.capacity ?? 0),
  };
}

export async function listChambers(companyId: string, params: ListParams) {
  const filter: Record<string, unknown> = { companyId, deletedAt: null };
  if (params.status) filter.status = params.status;
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  const [rows, total] = await Promise.all([
    ChamberModel.find(filter).sort({ [params.sortBy]: params.sortOrder }).skip(params.skip).limit(params.limit).lean(),
    ChamberModel.countDocuments(filter),
  ]);
  return { data: rows.map((row) => occupancy(row)), total };
}

export async function getChamber(companyId: string, id: string) {
  const chamber = await ChamberModel.findOne({ _id: id, companyId, deletedAt: null }).lean();
  if (!chamber) throw AppError.notFound('Chamber not found');
  return occupancy(chamber);
}

export async function createChamber(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  const code = String(input.code ?? (await nextCode(ChamberModel, companyId, 'C'))).toUpperCase();
  const existing = await ChamberModel.findOne({ companyId, code, deletedAt: null });
  if (existing) throw AppError.conflict('Chamber code already exists');
  const chamber = await ChamberModel.create({
    ...input,
    code,
    companyId,
    occupiedCapacity: 0,
    reservedCapacity: 0,
    damagedCapacity: 0,
    createdBy: actor.id,
  });
  await syncCompanyCapacity(companyId);
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Chamber',
    recordId: String(chamber._id),
    recordLabel: chamber.name,
  });
  return occupancy(chamber.toObject());
}

export async function updateChamber(companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) {
  const chamber = await ChamberModel.findOne({ _id: id, companyId, deletedAt: null });
  if (!chamber) throw AppError.notFound('Chamber not found');
  if (input.capacity != null && Number(input.capacity) < chamber.occupiedCapacity) {
    throw AppError.badRequest('Capacity cannot be less than occupied quantity');
  }
  Object.assign(chamber, input, { updatedBy: actor.id });
  await chamber.save();
  await syncCompanyCapacity(companyId);
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Chamber',
    recordId: id,
    recordLabel: chamber.name,
  });
  return occupancy(chamber.toObject());
}

export async function removeChamber(companyId: string, id: string, actor: AuthUser) {
  const chamber = await ChamberModel.findOne({ _id: id, companyId, deletedAt: null });
  if (!chamber) throw AppError.notFound('Chamber not found');
  if (chamber.occupiedCapacity > 0) throw AppError.badRequest('Cannot delete a chamber that still holds stock');
  const racks = await RackModel.countDocuments({ companyId, chamberId: id, deletedAt: null });
  if (racks > 0) throw AppError.badRequest('Delete racks in this chamber first');
  chamber.deletedAt = new Date();
  chamber.deletedBy = actor.id as unknown as typeof chamber.deletedBy;
  chamber.status = 'inactive';
  await chamber.save();
  await syncCompanyCapacity(companyId);
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'Chamber',
    recordId: id,
    recordLabel: chamber.name,
  });
  return chamber;
}

export async function listRacks(companyId: string, params: ListParams & { chamberId?: string }) {
  const filter: Record<string, unknown> = { companyId, deletedAt: null };
  if (params.chamberId) filter.chamberId = params.chamberId;
  if (params.status) filter.status = params.status;
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  const [rows, total] = await Promise.all([
    RackModel.find(filter).populate('chamberId', 'name code').sort({ [params.sortBy]: params.sortOrder }).skip(params.skip).limit(params.limit).lean(),
    RackModel.countDocuments(filter),
  ]);
  return { data: rows.map((row) => occupancy(row)), total };
}

export async function createRack(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  const chamberId = String(input.chamberId ?? '');
  const chamber = await ChamberModel.findOne({ _id: chamberId, companyId, deletedAt: null });
  if (!chamber) throw AppError.notFound('Chamber not found');
  const code = String(input.code ?? (await nextCode(RackModel, companyId, 'R'))).toUpperCase();
  const existing = await RackModel.findOne({ companyId, chamberId, code, deletedAt: null });
  if (existing) throw AppError.conflict('Rack code already exists in this chamber');
  const rack = await RackModel.create({
    ...input,
    code,
    chamberId,
    companyId,
    occupiedCapacity: 0,
    createdBy: actor.id,
  });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Rack',
    recordId: String(rack._id),
    recordLabel: rack.name,
  });
  return occupancy(rack.toObject());
}

export async function updateRack(companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) {
  const rack = await RackModel.findOne({ _id: id, companyId, deletedAt: null });
  if (!rack) throw AppError.notFound('Rack not found');
  if (input.capacity != null && Number(input.capacity) < rack.occupiedCapacity) {
    throw AppError.badRequest('Capacity cannot be less than occupied quantity');
  }
  Object.assign(rack, input, { updatedBy: actor.id });
  await rack.save();
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Rack',
    recordId: id,
    recordLabel: rack.name,
  });
  return occupancy(rack.toObject());
}

export async function removeRack(companyId: string, id: string, actor: AuthUser) {
  const rack = await RackModel.findOne({ _id: id, companyId, deletedAt: null });
  if (!rack) throw AppError.notFound('Rack not found');
  if (rack.occupiedCapacity > 0) throw AppError.badRequest('Cannot delete a rack that still holds stock');
  const locations = await LocationModel.countDocuments({ companyId, rackId: id, deletedAt: null });
  if (locations > 0) throw AppError.badRequest('Delete locations on this rack first');
  rack.deletedAt = new Date();
  rack.deletedBy = actor.id as unknown as typeof rack.deletedBy;
  rack.status = 'inactive';
  await rack.save();
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'Rack',
    recordId: id,
    recordLabel: rack.name,
  });
  return rack;
}

export async function listLocations(companyId: string, params: ListParams & { chamberId?: string; rackId?: string }) {
  const filter: Record<string, unknown> = { companyId, deletedAt: null };
  if (params.chamberId) filter.chamberId = params.chamberId;
  if (params.rackId) filter.rackId = params.rackId;
  if (params.status) filter.status = params.status;
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ code: rx }, { section: rx }];
  }
  const [rows, total] = await Promise.all([
    LocationModel.find(filter)
      .populate('chamberId', 'name code')
      .populate('rackId', 'name code')
      .sort({ [params.sortBy]: params.sortOrder })
      .skip(params.skip)
      .limit(params.limit)
      .lean(),
    LocationModel.countDocuments(filter),
  ]);
  return { data: rows.map((row) => occupancy(row)), total };
}

export async function createLocation(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  const chamber = await ChamberModel.findOne({ _id: input.chamberId, companyId, deletedAt: null });
  const rack = await RackModel.findOne({ _id: input.rackId, companyId, deletedAt: null });
  if (!chamber || !rack) throw AppError.notFound('Chamber or rack not found');
  if (String(rack.chamberId) !== String(chamber._id)) throw AppError.badRequest('Rack does not belong to the selected chamber');
  const section = String(input.section ?? 'S01').toUpperCase();
  const code = String(input.code ?? `${chamber.code}-${rack.code}-${section}`).toUpperCase();
  const existing = await LocationModel.findOne({ companyId, code, deletedAt: null });
  if (existing) throw AppError.conflict('Location code already exists');
  const location = await LocationModel.create({
    ...input,
    section,
    code,
    chamberId: chamber._id,
    rackId: rack._id,
    companyId,
    occupiedCapacity: 0,
    createdBy: actor.id,
  });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Location',
    recordId: String(location._id),
    recordLabel: location.code,
  });
  return occupancy(location.toObject());
}

export async function updateLocation(companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) {
  const location = await LocationModel.findOne({ _id: id, companyId, deletedAt: null });
  if (!location) throw AppError.notFound('Location not found');
  if (input.capacity != null && Number(input.capacity) < location.occupiedCapacity) {
    throw AppError.badRequest('Capacity cannot be less than occupied quantity');
  }
  Object.assign(location, input, { updatedBy: actor.id });
  await location.save();
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Location',
    recordId: id,
    recordLabel: location.code,
  });
  return occupancy(location.toObject());
}

export async function removeLocation(companyId: string, id: string, actor: AuthUser) {
  const location = await LocationModel.findOne({ _id: id, companyId, deletedAt: null });
  if (!location) throw AppError.notFound('Location not found');
  if (location.occupiedCapacity > 0) throw AppError.badRequest('Cannot delete a location that still holds stock');
  const stock = await InventoryModel.countDocuments({ companyId, locationId: id, deletedAt: null, quantity: { $gt: 0 } });
  if (stock > 0) throw AppError.badRequest('Location still has inventory');
  location.deletedAt = new Date();
  location.deletedBy = actor.id as unknown as typeof location.deletedBy;
  location.status = 'inactive';
  await location.save();
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'Location',
    recordId: id,
    recordLabel: location.code,
  });
  return location;
}
