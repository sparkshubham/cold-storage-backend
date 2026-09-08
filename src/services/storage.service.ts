import { prisma } from '../db/prisma.js';
import { notDeleted, orderField, serialize, withPopulated } from '../db/serialize.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { nextCode } from '../utils/codes.js';
import { occupancyPercent } from '../utils/stockMath.js';
import type { AuthUser } from '../types/auth.js';
import type { ListParams } from './tenantCrud.js';

async function syncCompanyCapacity(companyId: string) {
  const chambers = await prisma.chamber.findMany({ where: notDeleted({ companyId }), select: { capacity: true } });
  const total = chambers.reduce((sum: number, chamber: { capacity: number }) => sum + (chamber.capacity || 0), 0);
  await prisma.company.update({
    where: { id: companyId },
    data: { storageCapacity: total, chamberCount: chambers.length },
  });
}

function occupancy(doc: Record<string, unknown>) {
  const capacity = Number(doc.capacity ?? 0);
  const occupied = Number(doc.occupiedCapacity ?? 0);
  return {
    ...doc,
    availableCapacity: capacity - occupied,
    occupancyPercent: occupancyPercent(occupied, capacity),
  };
}

function occupySerialize(doc: Record<string, unknown>) {
  return occupancy(serialize(doc) as Record<string, unknown>);
}

function occupyPopulated(doc: Record<string, unknown>, map: Record<string, string>) {
  return occupancy(withPopulated(doc, map) as Record<string, unknown>);
}

export async function listChambers(companyId: string, params: ListParams) {
  const where: Record<string, unknown> = notDeleted({ companyId });
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { code: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  const orderBy = { [orderField(params.sortBy)]: params.sortOrder === -1 ? 'desc' : 'asc' };
  const [rows, total] = await Promise.all([
    prisma.chamber.findMany({ where, orderBy, skip: params.skip, take: params.limit }),
    prisma.chamber.count({ where }),
  ]);
  return { data: (rows as Record<string, unknown>[]).map((row) => occupySerialize(row)), total };
}

export async function getChamber(companyId: string, id: string) {
  const chamber = await prisma.chamber.findFirst({ where: notDeleted({ id, companyId }) });
  if (!chamber) throw AppError.notFound('Chamber not found');
  return occupySerialize(chamber as unknown as Record<string, unknown>);
}

export async function createChamber(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  const code = String(input.code ?? (await nextCode(prisma.chamber, companyId, 'C'))).toUpperCase();
  const existing = await prisma.chamber.findFirst({ where: notDeleted({ companyId, code }) });
  if (existing) throw AppError.conflict('Chamber code already exists');
  const chamber = await prisma.chamber.create({
    data: {
      name: String(input.name ?? ''),
      code,
      companyId,
      capacity: Number(input.capacity ?? 0),
      capacityUnit: input.capacityUnit != null ? String(input.capacityUnit) : undefined,
      temperature: input.temperature != null ? Number(input.temperature) : null,
      minTemperature: input.minTemperature != null ? Number(input.minTemperature) : null,
      maxTemperature: input.maxTemperature != null ? Number(input.maxTemperature) : null,
      location: input.location != null ? String(input.location) : undefined,
      occupiedCapacity: 0,
      reservedCapacity: 0,
      damagedCapacity: 0,
      createdBy: actor.id,
    },
  });
  await syncCompanyCapacity(companyId);
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Chamber',
    recordId: chamber.id,
    recordLabel: chamber.name,
  });
  return occupySerialize(chamber as unknown as Record<string, unknown>);
}

export async function updateChamber(companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) {
  const chamber = await prisma.chamber.findFirst({ where: notDeleted({ id, companyId }) });
  if (!chamber) throw AppError.notFound('Chamber not found');
  if (input.capacity != null && Number(input.capacity) < chamber.occupiedCapacity) {
    throw AppError.badRequest('Capacity cannot be less than occupied quantity');
  }
  const data: Record<string, unknown> = { ...input, updatedBy: actor.id };
  if (data.code) data.code = String(data.code).toUpperCase();
  delete data.id;
  delete data._id;
  const updated = await prisma.chamber.update({ where: { id }, data });
  await syncCompanyCapacity(companyId);
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Chamber',
    recordId: id,
    recordLabel: updated.name,
  });
  return occupySerialize(updated as unknown as Record<string, unknown>);
}

export async function removeChamber(companyId: string, id: string, actor: AuthUser) {
  const chamber = await prisma.chamber.findFirst({ where: notDeleted({ id, companyId }) });
  if (!chamber) throw AppError.notFound('Chamber not found');
  if (chamber.occupiedCapacity > 0) throw AppError.badRequest('Cannot delete a chamber that still holds stock');
  const racks = await prisma.rack.count({ where: notDeleted({ companyId, chamberId: id }) });
  if (racks > 0) throw AppError.badRequest('Delete racks in this chamber first');
  const pillars = await prisma.pillar.count({ where: notDeleted({ companyId, chamberId: id }) });
  if (pillars > 0) throw AppError.badRequest('Delete pillars in this chamber first');
  const updated = await prisma.chamber.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actor.id, status: 'inactive' },
  });
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
  return serialize(updated);
}

export async function listRacks(companyId: string, params: ListParams & { chamberId?: string }) {
  const where: Record<string, unknown> = notDeleted({ companyId });
  if (params.chamberId) where.chamberId = params.chamberId;
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { code: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  const orderBy = { [orderField(params.sortBy)]: params.sortOrder === -1 ? 'desc' : 'asc' };
  const [rows, total] = await Promise.all([
    prisma.rack.findMany({
      where,
      orderBy,
      skip: params.skip,
      take: params.limit,
      include: { chamber: { select: { id: true, name: true, code: true } } },
    }),
    prisma.rack.count({ where }),
  ]);
  return {
    data: (rows as Record<string, unknown>[]).map((row) => occupyPopulated(row, { chamber: 'chamberId' })),
    total,
  };
}

export async function createRack(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  const chamberId = String(input.chamberId ?? '');
  const chamber = await prisma.chamber.findFirst({ where: notDeleted({ id: chamberId, companyId }) });
  if (!chamber) throw AppError.notFound('Chamber not found');
  const code = String(input.code ?? (await nextCode(prisma.rack, companyId, 'R'))).toUpperCase();
  const existing = await prisma.rack.findFirst({ where: notDeleted({ companyId, chamberId, code }) });
  if (existing) throw AppError.conflict('Rack code already exists in this chamber');
  const rack = await prisma.rack.create({
    data: {
      name: String(input.name ?? ''),
      code,
      chamberId,
      companyId,
      capacity: Number(input.capacity ?? 0),
      occupiedCapacity: 0,
      createdBy: actor.id,
    },
  });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Rack',
    recordId: rack.id,
    recordLabel: rack.name,
  });
  return occupySerialize(rack as unknown as Record<string, unknown>);
}

export async function updateRack(companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) {
  const rack = await prisma.rack.findFirst({ where: notDeleted({ id, companyId }) });
  if (!rack) throw AppError.notFound('Rack not found');
  if (input.capacity != null && Number(input.capacity) < rack.occupiedCapacity) {
    throw AppError.badRequest('Capacity cannot be less than occupied quantity');
  }
  const data: Record<string, unknown> = { ...input, updatedBy: actor.id };
  if (data.code) data.code = String(data.code).toUpperCase();
  delete data.id;
  delete data._id;
  const updated = await prisma.rack.update({ where: { id }, data });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Rack',
    recordId: id,
    recordLabel: updated.name,
  });
  return occupySerialize(updated as unknown as Record<string, unknown>);
}

export async function removeRack(companyId: string, id: string, actor: AuthUser) {
  const rack = await prisma.rack.findFirst({ where: notDeleted({ id, companyId }) });
  if (!rack) throw AppError.notFound('Rack not found');
  if (rack.occupiedCapacity > 0) throw AppError.badRequest('Cannot delete a rack that still holds stock');
  const locations = await prisma.location.count({ where: notDeleted({ companyId, rackId: id }) });
  if (locations > 0) throw AppError.badRequest('Delete locations on this rack first');
  const updated = await prisma.rack.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actor.id, status: 'inactive' },
  });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'Rack',
    recordId: id,
    recordLabel: rack.name,
  });
  return serialize(updated);
}

export async function listPillars(companyId: string, params: ListParams & { chamberId?: string; rackId?: string }) {
  const where: Record<string, unknown> = notDeleted({ companyId });
  if (params.chamberId) where.chamberId = params.chamberId;
  if (params.rackId) where.rackId = params.rackId;
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { code: { contains: params.search, mode: 'insensitive' } },
      { series: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  const orderBy = { [orderField(params.sortBy)]: params.sortOrder === -1 ? 'desc' : 'asc' };
  const [rows, total] = await Promise.all([
    prisma.pillar.findMany({
      where,
      orderBy,
      skip: params.skip,
      take: params.limit,
      include: {
        chamber: { select: { id: true, name: true, code: true } },
        rack: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.pillar.count({ where }),
  ]);
  return {
    data: (rows as Record<string, unknown>[]).map((row) =>
      occupyPopulated(row, { chamber: 'chamberId', rack: 'rackId' }),
    ),
    total,
  };
}

export async function getPillar(companyId: string, id: string) {
  const pillar = await prisma.pillar.findFirst({
    where: notDeleted({ id, companyId }),
    include: {
      chamber: { select: { id: true, name: true, code: true } },
      rack: { select: { id: true, name: true, code: true } },
    },
  });
  if (!pillar) throw AppError.notFound('Pillar not found');
  return occupyPopulated(pillar as unknown as Record<string, unknown>, { chamber: 'chamberId', rack: 'rackId' });
}

export async function createPillar(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  const chamberId = String(input.chamberId ?? '');
  const chamber = await prisma.chamber.findFirst({ where: notDeleted({ id: chamberId, companyId }) });
  if (!chamber) throw AppError.notFound('Chamber not found');
  const rackId = input.rackId ? String(input.rackId) : null;
  if (rackId) {
    const rack = await prisma.rack.findFirst({ where: notDeleted({ id: rackId, companyId }) });
    if (!rack) throw AppError.notFound('Rack not found');
    if (rack.chamberId !== chamberId) throw AppError.badRequest('Rack does not belong to the selected chamber');
  }
  const series = String(input.series ?? 'B').toUpperCase();
  const code = String(input.code ?? (await nextCode(prisma.pillar, companyId, series || 'P'))).toUpperCase();
  const existing = await prisma.pillar.findFirst({ where: notDeleted({ companyId, chamberId, code }) });
  if (existing) throw AppError.conflict('Pillar code already exists in this chamber');
  const pillar = await prisma.pillar.create({
    data: {
      name: String(input.name ?? ''),
      code,
      series,
      chamberId,
      rackId,
      capacity: Number(input.capacity ?? 0),
      companyId,
      occupiedCapacity: 0,
      createdBy: actor.id,
    },
  });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Pillar',
    recordId: pillar.id,
    recordLabel: pillar.name,
  });
  return occupySerialize(pillar as unknown as Record<string, unknown>);
}

export async function updatePillar(companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) {
  const pillar = await prisma.pillar.findFirst({ where: notDeleted({ id, companyId }) });
  if (!pillar) throw AppError.notFound('Pillar not found');
  if (input.capacity != null && Number(input.capacity) < pillar.occupiedCapacity) {
    throw AppError.badRequest('Capacity cannot be less than occupied quantity');
  }
  if (input.chamberId) {
    const chamber = await prisma.chamber.findFirst({
      where: notDeleted({ id: String(input.chamberId), companyId }),
    });
    if (!chamber) throw AppError.notFound('Chamber not found');
  }
  const data: Record<string, unknown> = { ...input, updatedBy: actor.id };
  if (data.rackId === '') data.rackId = null;
  if (data.rackId) {
    const chamberId = String(data.chamberId ?? pillar.chamberId);
    const rack = await prisma.rack.findFirst({
      where: notDeleted({ id: String(data.rackId), companyId }),
    });
    if (!rack) throw AppError.notFound('Rack not found');
    if (rack.chamberId !== chamberId) throw AppError.badRequest('Rack does not belong to the selected chamber');
  }
  if (data.series != null) data.series = String(data.series).toUpperCase();
  if (data.code != null) data.code = String(data.code).toUpperCase();
  delete data.id;
  delete data._id;
  const updated = await prisma.pillar.update({ where: { id }, data });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Pillar',
    recordId: id,
    recordLabel: updated.name,
  });
  return occupySerialize(updated as unknown as Record<string, unknown>);
}

export async function removePillar(companyId: string, id: string, actor: AuthUser) {
  const pillar = await prisma.pillar.findFirst({ where: notDeleted({ id, companyId }) });
  if (!pillar) throw AppError.notFound('Pillar not found');
  if (pillar.occupiedCapacity > 0) throw AppError.badRequest('Cannot delete a pillar that still holds stock');
  const locations = await prisma.location.count({ where: notDeleted({ companyId, pillarId: id }) });
  if (locations > 0) throw AppError.badRequest('Delete locations on this pillar first');
  const updated = await prisma.pillar.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actor.id, status: 'inactive' },
  });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'Pillar',
    recordId: id,
    recordLabel: pillar.name,
  });
  return serialize(updated);
}

export async function listLocations(
  companyId: string,
  params: ListParams & { chamberId?: string; rackId?: string; pillarId?: string },
) {
  const where: Record<string, unknown> = notDeleted({ companyId });
  if (params.chamberId) where.chamberId = params.chamberId;
  if (params.rackId) where.rackId = params.rackId;
  if (params.pillarId) where.pillarId = params.pillarId;
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { code: { contains: params.search, mode: 'insensitive' } },
      { section: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  const orderBy = { [orderField(params.sortBy)]: params.sortOrder === -1 ? 'desc' : 'asc' };
  const [rows, total] = await Promise.all([
    prisma.location.findMany({
      where,
      orderBy,
      skip: params.skip,
      take: params.limit,
      include: {
        chamber: { select: { id: true, name: true, code: true } },
        rack: { select: { id: true, name: true, code: true } },
        pillar: { select: { id: true, name: true, code: true, series: true } },
      },
    }),
    prisma.location.count({ where }),
  ]);
  return {
    data: (rows as Record<string, unknown>[]).map((row) =>
      occupyPopulated(row, {
        chamber: 'chamberId',
        rack: 'rackId',
        pillar: 'pillarId',
      }),
    ),
    total,
  };
}

export async function createLocation(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  const chamber = await prisma.chamber.findFirst({
    where: notDeleted({ id: String(input.chamberId), companyId }),
  });
  const rack = await prisma.rack.findFirst({
    where: notDeleted({ id: String(input.rackId), companyId }),
  });
  if (!chamber || !rack) throw AppError.notFound('Chamber or rack not found');
  if (rack.chamberId !== chamber.id) throw AppError.badRequest('Rack does not belong to the selected chamber');
  let pillarId = input.pillarId ? String(input.pillarId) : null;
  if (pillarId) {
    const pillar = await prisma.pillar.findFirst({ where: notDeleted({ id: pillarId, companyId }) });
    if (!pillar) throw AppError.notFound('Pillar not found');
    if (pillar.chamberId !== chamber.id) throw AppError.badRequest('Pillar does not belong to the selected chamber');
  }
  const section = String(input.section ?? 'S01').toUpperCase();
  const code = String(input.code ?? `${chamber.code}-${rack.code}-${section}`).toUpperCase();
  const existing = await prisma.location.findFirst({ where: notDeleted({ companyId, code }) });
  if (existing) throw AppError.conflict('Location code already exists');
  const location = await prisma.location.create({
    data: {
      section,
      code,
      chamberId: chamber.id,
      rackId: rack.id,
      pillarId,
      companyId,
      capacity: Number(input.capacity ?? 0),
      occupiedCapacity: 0,
      createdBy: actor.id,
    },
  });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Location',
    recordId: location.id,
    recordLabel: location.code,
  });
  return occupySerialize(location as unknown as Record<string, unknown>);
}

export async function updateLocation(companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) {
  const location = await prisma.location.findFirst({ where: notDeleted({ id, companyId }) });
  if (!location) throw AppError.notFound('Location not found');
  if (input.capacity != null && Number(input.capacity) < location.occupiedCapacity) {
    throw AppError.badRequest('Capacity cannot be less than occupied quantity');
  }
  const data: Record<string, unknown> = { ...input, updatedBy: actor.id };
  if (data.pillarId === '') data.pillarId = null;
  delete data.id;
  delete data._id;
  const updated = await prisma.location.update({ where: { id }, data });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Location',
    recordId: id,
    recordLabel: updated.code,
  });
  return occupySerialize(updated as unknown as Record<string, unknown>);
}

export async function removeLocation(companyId: string, id: string, actor: AuthUser) {
  const location = await prisma.location.findFirst({ where: notDeleted({ id, companyId }) });
  if (!location) throw AppError.notFound('Location not found');
  if (location.occupiedCapacity > 0) throw AppError.badRequest('Cannot delete a location that still holds stock');
  const stock = await prisma.inventory.count({
    where: notDeleted({ companyId, locationId: id, quantity: { gt: 0 } }),
  });
  if (stock > 0) throw AppError.badRequest('Location still has inventory');
  const updated = await prisma.location.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actor.id, status: 'inactive' },
  });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'Location',
    recordId: id,
    recordLabel: location.code,
  });
  return serialize(updated);
}
