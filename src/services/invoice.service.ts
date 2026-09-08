import { prisma } from '../db/prisma.js';
import { notDeleted, serialize, withPopulated } from '../db/serialize.js';
import { getSettings } from './settings.service.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { nextCode } from '../utils/codes.js';
import { withTransaction } from '../utils/transaction.js';
import type { AuthUser } from '../types/auth.js';
import type { ListParams } from './tenantCrud.js';
import { getInward, getOutward } from './inventory.service.js';
import { handlingChargeQty, handlingChargeUnit } from '../utils/billingQty.js';

type SourceType = 'inward' | 'outward';

type RateInput = {
  storageRatePerUnitPerDay?: number;
  inwardHandlingRate?: number;
  outwardHandlingRate?: number;
  gstRate?: number;
};

type InvoiceItem = {
  description: string;
  hsn: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  date?: Date | null;
  challanNumber?: string;
  sourceId?: string;
  lineType?: string;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function storageDaysBetween(from: Date, to: Date) {
  const days = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
  return Math.max(1, days);
}

type SettingsLike = {
  storageRatePerUnitPerDay?: number;
  inwardHandlingRate?: number;
  outwardHandlingRate?: number;
  defaultGstRate?: number;
  handlingChargeBasis?: string;
  handlingWeightUnit?: string;
  unitRates?: Array<{
    unit?: string;
    storageRatePerUnitPerDay?: number;
    inwardHandlingRate?: number;
    outwardHandlingRate?: number;
  }>;
};

export function ratesForUnit(settings: SettingsLike, unit: string, overrides: RateInput = {}) {
  const code = String(unit ?? '').trim().toUpperCase();
  const row = (settings.unitRates ?? []).find((item) => String(item.unit ?? '').trim().toUpperCase() === code);
  return {
    unit: code,
    rateSource: (row ? 'unit' : 'default') as 'unit' | 'default',
    storageRatePerUnitPerDay: Number(
      overrides.storageRatePerUnitPerDay ?? row?.storageRatePerUnitPerDay ?? settings.storageRatePerUnitPerDay ?? 20,
    ),
    inwardHandlingRate: Number(
      overrides.inwardHandlingRate ?? row?.inwardHandlingRate ?? settings.inwardHandlingRate ?? 40,
    ),
    outwardHandlingRate: Number(
      overrides.outwardHandlingRate ?? row?.outwardHandlingRate ?? settings.outwardHandlingRate ?? 40,
    ),
    gstRate: Number(overrides.gstRate ?? settings.defaultGstRate ?? 18),
  };
}

function idOf(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && '_id' in value) return String((value as { _id: unknown })._id);
  if (typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id);
  return String(value);
}

const invoicePopulateMap = { customer: 'customerId', product: 'productId' };

async function loadSettings(companyId: string) {
  return getSettings(companyId);
}

async function findRelatedInward(outward: {
  companyId: unknown;
  customerId: unknown;
  productId: unknown;
  locationId: unknown;
  batchId?: unknown;
  date: Date;
}) {
  const companyId = idOf(outward.companyId);
  if (outward.batchId) {
    const byBatch = await prisma.inward.findFirst({
      where: notDeleted({ companyId, batchId: idOf(outward.batchId) }),
      orderBy: { date: 'asc' },
    });
    if (byBatch) return byBatch;
  }
  return prisma.inward.findFirst({
    where: notDeleted({
      companyId,
      customerId: idOf(outward.customerId),
      productId: idOf(outward.productId),
      locationId: idOf(outward.locationId),
      date: { lte: outward.date },
    }),
    orderBy: { date: 'desc' },
  });
}

export function parseSourceIds(input: { sourceId?: string; sourceIds?: string | string[] }) {
  const extra = Array.isArray(input.sourceIds) ? input.sourceIds : String(input.sourceIds ?? '').split(/[,\s]+/);
  const ids = [input.sourceId, ...extra]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

async function existingIssuedForSources(companyId: string, _sourceType: SourceType, sourceIds: string[]) {
  return prisma.invoice.findFirst({
    where: {
      companyId,
      status: 'issued',
      deletedAt: null,
      OR: [{ sourceId: { in: sourceIds } }, { sourceIds: { hasSome: sourceIds } }],
    },
  });
}

export async function buildInvoiceDraft(companyId: string, sourceType: SourceType, sourceId: string, rates: RateInput = {}) {
  return buildInvoiceDraftForSources(companyId, sourceType, [sourceId], rates);
}

export async function buildInvoiceDraftForSources(
  companyId: string,
  sourceType: SourceType,
  sourceIds: string[],
  rates: RateInput = {},
) {
  const ids = [...new Set(sourceIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) throw AppError.badRequest('Select at least one challan');
  const settings = (await loadSettings(companyId)) as SettingsLike & { invoicePrefix?: string };
  const slips = [];
  for (const id of ids) {
    slips.push(sourceType === 'inward' ? await getInward(companyId, id) : await getOutward(companyId, id));
  }
  slips.sort((a, b) => new Date(String(a.date)).getTime() - new Date(String(b.date)).getTime());
  const customerId = idOf(slips[0].customerId);
  if (slips.some((slip) => idOf(slip.customerId) !== customerId)) {
    throw AppError.badRequest('Combined bill must be for the same customer');
  }
  if (slips.some((slip) => String(slip.status ?? '') === 'cancelled')) {
    throw AppError.badRequest('Cancelled challans cannot be billed');
  }

  const existing = await existingIssuedForSources(companyId, sourceType, ids);
  const items: InvoiceItem[] = [];
  const inwardIdsCharged = new Set<string>();
  let quantity = 0;
  let storageFrom: Date | null = null;
  let storageTo: Date | null = null;
  let storageDays = 0;
  let unit = String(slips[0].unit ?? '');
  let productId = idOf(slips[0].productId);
  let gstRate = Number(settings.defaultGstRate ?? 18);
  let displayRates = ratesForUnit(settings, unit, rates);

  for (const source of slips) {
    const product = await prisma.product.findFirst({
      where: notDeleted({ id: idOf(source.productId), companyId }),
    });
    const hsn = product?.hsn ?? '';
    const productName = product?.name ? String(product.name) : 'Goods';
    const slipQty = Number(source.quantity);
    const slipUnit = String(source.unit ?? '');
    const slipDate = new Date(String(source.date));
    const challanNumber = String(
      (source as { challanNumber?: string }).challanNumber
        || (source as { inwardNumber?: string }).inwardNumber
        || (source as { outwardNumber?: string }).outwardNumber
        || '',
    );
    const relatedInward =
      sourceType === 'inward'
        ? source
        : await findRelatedInward({
            companyId,
            customerId: idOf(source.customerId),
            productId: idOf(source.productId),
            locationId: idOf(source.locationId),
            batchId: (source as { batchId?: unknown }).batchId,
            date: slipDate,
          });
    const packingRates = ratesForUnit(settings, slipUnit, rates);
    const handleUnit = handlingChargeUnit(source as never, settings);
    const handleQty = handlingChargeQty(source as never, settings);
    const handleRates = ratesForUnit(settings, handleUnit || slipUnit, rates);
    gstRate = packingRates.gstRate;
    displayRates = packingRates;
    quantity += slipQty;
    unit = slipUnit;
    productId = idOf(source.productId);

    if (sourceType === 'outward') {
      const from = relatedInward ? new Date(String(relatedInward.date)) : slipDate;
      const days = storageDaysBetween(from, slipDate);
      storageDays += days;
      if (!storageFrom || from < storageFrom) storageFrom = from;
      if (!storageTo || slipDate > storageTo) storageTo = slipDate;
      const rate = round2(packingRates.storageRatePerUnitPerDay * days);
      items.push({
        description: `${formatDateLabel(slipDate)} · ${challanNumber} · ${productName} · storage ${days} day${days === 1 ? '' : 's'}`,
        hsn,
        quantity: slipQty,
        unit: slipUnit,
        rate,
        amount: round2(slipQty * rate),
        date: slipDate,
        challanNumber,
        sourceId: idOf(source),
        lineType: 'storage',
      });
    }

    const relatedInwardId = relatedInward ? idOf(relatedInward) : '';
    const inwardAlreadyOnSlip = Boolean(relatedInward && (relatedInward as { invoiceId?: unknown }).invoiceId);
    if (
      handleRates.inwardHandlingRate > 0
      && handleQty > 0
      && (sourceType === 'inward' || (relatedInward && !inwardAlreadyOnSlip && !inwardIdsCharged.has(relatedInwardId)))
    ) {
      if (relatedInwardId) inwardIdsCharged.add(relatedInwardId);
      const handleDate = sourceType === 'inward' ? slipDate : new Date(String(relatedInward!.date));
      const handleChallan =
        sourceType === 'inward'
          ? challanNumber
          : String(
              (relatedInward as { challanNumber?: string; inwardNumber?: string })?.challanNumber
                || (relatedInward as { inwardNumber?: string })?.inwardNumber
                || challanNumber,
            );
      items.push({
        description: `${formatDateLabel(handleDate)} · ${handleChallan} · ${productName} · inward handling`,
        hsn,
        quantity: handleQty,
        unit: handleUnit || slipUnit,
        rate: handleRates.inwardHandlingRate,
        amount: round2(handleQty * handleRates.inwardHandlingRate),
        date: handleDate,
        challanNumber: handleChallan,
        sourceId: idOf(source),
        lineType: 'inward_handling',
      });
    }

    if (sourceType === 'outward' && handleRates.outwardHandlingRate > 0 && handleQty > 0) {
      items.push({
        description: `${formatDateLabel(slipDate)} · ${challanNumber} · ${productName} · outward handling`,
        hsn,
        quantity: handleQty,
        unit: handleUnit || slipUnit,
        rate: handleRates.outwardHandlingRate,
        amount: round2(handleQty * handleRates.outwardHandlingRate),
        date: slipDate,
        challanNumber,
        sourceId: idOf(source),
        lineType: 'outward_handling',
      });
    }
  }

  items.sort((a, b) => {
    const left = a.date ? new Date(a.date).getTime() : 0;
    const right = b.date ? new Date(b.date).getTime() : 0;
    return left - right;
  });

  if (!items.length) {
    throw AppError.badRequest('No billable lines for these challans. Check handling and storage rates in settings.');
  }

  const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const gstAmount = round2(subtotal * (gstRate / 100));
  const total = round2(subtotal + gstAmount);
  const first = slips[0];
  const last = slips[slips.length - 1];
  const sourceNumbers = slips.map((slip) =>
    String(
      (slip as { challanNumber?: string }).challanNumber
        || (slip as { inwardNumber?: string }).inwardNumber
        || (slip as { outwardNumber?: string }).outwardNumber
        || '',
    ),
  );

  return {
    sourceType,
    sourceId: ids[0],
    sourceIds: ids,
    inwardId: sourceType === 'inward' ? ids[0] : null,
    outwardId: sourceType === 'outward' ? ids[0] : null,
    inwardIds: sourceType === 'inward' ? ids : [...inwardIdsCharged],
    outwardIds: sourceType === 'outward' ? ids : [],
    customerId,
    productId,
    customer: first.customerId,
    product: first.productId,
    sourceNumber: sourceNumbers.join(', '),
    quantity,
    unit,
    rateSource: displayRates.rateSource,
    handlingChargeBasis: settings.handlingChargeBasis === 'quantity' ? 'quantity' : 'weight',
    handlingWeightUnit: String(settings.handlingWeightUnit || 'KG').toUpperCase(),
    storageFrom: sourceType === 'outward' ? storageFrom : null,
    storageTo: sourceType === 'outward' ? storageTo : null,
    storageDays,
    items,
    subtotal,
    gstRate,
    gstAmount,
    total,
    alreadyBilled: Boolean(existing),
    existingInvoiceId: existing ? existing.id : null,
    existingInvoiceNumber: existing?.invoiceNumber ?? null,
    rates: {
      storageRatePerUnitPerDay: displayRates.storageRatePerUnitPerDay,
      inwardHandlingRate: ratesForUnit(
        settings,
        settings.handlingChargeBasis === 'quantity' ? unit : String(settings.handlingWeightUnit || 'KG'),
        rates,
      ).inwardHandlingRate,
      outwardHandlingRate: ratesForUnit(
        settings,
        settings.handlingChargeBasis === 'quantity' ? unit : String(settings.handlingWeightUnit || 'KG'),
        rates,
      ).outwardHandlingRate,
      gstRate,
    },
    inwardAlreadyBilled: false,
    challans: slips.map((slip) => ({
      id: idOf(slip),
      number: String(
        (slip as { challanNumber?: string }).challanNumber
          || (slip as { inwardNumber?: string }).inwardNumber
          || (slip as { outwardNumber?: string }).outwardNumber
          || '',
      ),
      date: slip.date,
      quantity: Number(slip.quantity),
      unit: String(slip.unit ?? ''),
      weight: Number((slip as { weight?: number }).weight ?? 0),
      weightUnit: String((slip as { weightUnit?: string }).weightUnit ?? 'KG'),
    })),
    fromDate: first.date,
    toDate: last.date,
  };
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString('en-IN');
}

export async function previewInvoice(
  companyId: string,
  sourceType: SourceType,
  sourceId: string,
  rates: RateInput & { sourceIds?: string | string[] } = {},
) {
  const ids = parseSourceIds({ sourceId, sourceIds: rates.sourceIds });
  return buildInvoiceDraftForSources(companyId, sourceType, ids, rates);
}

export async function generateInvoice(
  companyId: string,
  input: RateInput & { sourceType: SourceType; sourceId?: string; sourceIds?: string[]; notes?: string; date?: Date },
  actor: AuthUser,
) {
  const ids = parseSourceIds(input);
  const draft = await buildInvoiceDraftForSources(companyId, input.sourceType, ids, input);
  if (draft.alreadyBilled) {
    throw AppError.conflict(`A bill already exists for one of these challans (${draft.existingInvoiceNumber})`);
  }

  const settings = await loadSettings(companyId);
  const invoiceNumber = await nextCode(prisma.invoice, companyId, settings.invoicePrefix || 'INV', 'invoiceNumber');

  const invoiceId = await withTransaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        companyId,
        invoiceNumber,
        date: input.date ? new Date(input.date) : new Date(),
        customerId: draft.customerId,
        sourceType: draft.sourceType,
        sourceId: draft.sourceId,
        sourceIds: ids,
        inwardId: draft.inwardId,
        outwardId: draft.outwardId,
        inwardIds: draft.inwardIds,
        outwardIds: draft.outwardIds,
        productId: draft.productId || null,
        storageFrom: draft.storageFrom,
        storageTo: draft.storageTo,
        storageDays: draft.storageDays,
        quantity: draft.quantity,
        unit: draft.unit,
        items: draft.items,
        subtotal: draft.subtotal,
        gstRate: draft.gstRate,
        gstAmount: draft.gstAmount,
        total: draft.total,
        notes: input.notes ?? '',
        status: 'issued',
        createdBy: actor.id,
      },
    });

    if (input.sourceType === 'inward') {
      await tx.inward.updateMany({
        where: { id: { in: ids }, companyId },
        data: { invoiceId: invoice.id },
      });
    } else {
      await tx.outward.updateMany({
        where: { id: { in: ids }, companyId },
        data: { invoiceId: invoice.id },
      });
      if (draft.inwardIds?.length) {
        await tx.inward.updateMany({
          where: { id: { in: draft.inwardIds }, companyId, invoiceId: null },
          data: { invoiceId: invoice.id },
        });
      }
    }
    return invoice.id;
  });

  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Invoice',
    recordId: invoiceId,
    recordLabel: invoiceNumber,
  });

  return getInvoice(companyId, invoiceId);
}

export async function listInvoices(companyId: string, params: ListParams) {
  const where: Record<string, unknown> = notDeleted({ companyId });
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { invoiceNumber: { contains: params.search, mode: 'insensitive' } },
      { notes: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.limit,
      include: {
        customer: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  return {
    data: (rows as Record<string, unknown>[]).map((row) => withPopulated(row, invoicePopulateMap)),
    total,
  };
}

export async function getInvoice(companyId: string, id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: notDeleted({ id, companyId }),
    include: {
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
      product: { select: { id: true, name: true, code: true, hsn: true } },
    },
  });
  if (!invoice) throw AppError.notFound('Invoice not found');
  const company = await prisma.company.findFirst({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      legalName: true,
      mobile: true,
      email: true,
      gstin: true,
      pan: true,
      addressLine1: true,
      addressLine2: true,
      addressCity: true,
      addressState: true,
      addressPincode: true,
    },
  });
  return {
    invoice: withPopulated(invoice as unknown as Record<string, unknown>, invoicePopulateMap),
    company: company ? serialize(company) : null,
  };
}

export async function updateInvoice(companyId: string, id: string, input: { notes?: string }, actor: AuthUser) {
  const invoice = await prisma.invoice.findFirst({ where: notDeleted({ id, companyId }) });
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.status === 'cancelled') throw AppError.badRequest('Cancelled bills cannot be edited');
  await prisma.invoice.update({
    where: { id },
    data: {
      ...(input.notes != null ? { notes: input.notes } : {}),
      updatedBy: actor.id,
    },
  });
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Invoice',
    recordId: id,
    recordLabel: invoice.invoiceNumber,
  });
  return getInvoice(companyId, id);
}

export async function cancelInvoice(companyId: string, id: string, actor: AuthUser) {
  const invoice = await prisma.invoice.findFirst({ where: notDeleted({ id, companyId }) });
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.status === 'cancelled') throw AppError.badRequest('This bill is already cancelled');

  await withTransaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: { status: 'cancelled', updatedBy: actor.id },
    });
    await tx.inward.updateMany({
      where: { companyId, invoiceId: invoice.id },
      data: { invoiceId: null },
    });
    await tx.outward.updateMany({
      where: { companyId, invoiceId: invoice.id },
      data: { invoiceId: null },
    });
  });

  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'DELETE',
    module: 'Invoice',
    recordId: id,
    recordLabel: invoice.invoiceNumber,
  });
  return getInvoice(companyId, id);
}
