import mongoose from 'mongoose';
import { CompanyModel } from '../models/Company.js';
import { InvoiceModel } from '../models/Invoice.js';
import { InwardModel } from '../models/Inward.js';
import { OutwardModel } from '../models/Outward.js';
import { ProductModel } from '../models/Product.js';
import { SettingsModel } from '../models/Settings.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { nextCode } from '../utils/codes.js';
import { escapeRegex } from '../utils/pagination.js';
import type { AuthUser } from '../types/auth.js';
import type { ListParams } from './tenantCrud.js';
import { getInward, getOutward } from './inventory.service.js';

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

function idOf(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && '_id' in value) return String((value as { _id: unknown })._id);
  return String(value);
}

const invoicePopulate = [
  { path: 'customerId', select: 'name code mobile email gstin address city state pincode' },
  { path: 'productId', select: 'name code hsn' },
  { path: 'inwardId', select: 'inwardNumber date quantity unit' },
  { path: 'outwardId', select: 'outwardNumber date quantity unit' },
  { path: 'companyId', select: 'name legalName mobile email gstin pan address' },
];

async function loadSettings(companyId: string) {
  return (
    (await SettingsModel.findOne({ companyId })) ?? {
      invoicePrefix: 'INV',
      defaultGstRate: 18,
      storageRatePerUnitPerDay: 20,
      inwardHandlingRate: 40,
      outwardHandlingRate: 40,
    }
  );
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
    const byBatch = await InwardModel.findOne({
      companyId,
      batchId: outward.batchId,
      deletedAt: null,
    }).sort({ date: 1 });
    if (byBatch) return byBatch;
  }
  return InwardModel.findOne({
    companyId,
    customerId: outward.customerId,
    productId: outward.productId,
    locationId: outward.locationId,
    date: { $lte: outward.date },
    deletedAt: null,
  }).sort({ date: -1 });
}

async function existingIssuedInvoice(companyId: string, sourceType: SourceType, sourceId: string) {
  return InvoiceModel.findOne({
    companyId,
    sourceType,
    sourceId,
    status: 'issued',
    deletedAt: null,
  });
}

export async function buildInvoiceDraft(companyId: string, sourceType: SourceType, sourceId: string, rates: RateInput = {}) {
  const settings = await loadSettings(companyId);
  const storageRate = rates.storageRatePerUnitPerDay ?? Number(settings.storageRatePerUnitPerDay ?? 20);
  const inwardHandlingRate = rates.inwardHandlingRate ?? Number(settings.inwardHandlingRate ?? 40);
  const outwardHandlingRate = rates.outwardHandlingRate ?? Number(settings.outwardHandlingRate ?? 40);
  const gstRate = rates.gstRate ?? Number(settings.defaultGstRate ?? 18);

  const source = sourceType === 'inward' ? await getInward(companyId, sourceId) : await getOutward(companyId, sourceId);
  const relatedInward = sourceType === 'inward' ? source : await findRelatedInward(source as never);
  const product = await ProductModel.findOne({ _id: source.productId, companyId, deletedAt: null });
  const hsn = product?.hsn ?? '';
  const quantity = Number(source.quantity);
  const unit = String(source.unit ?? '');
  const storageFrom = relatedInward ? new Date(relatedInward.date) : new Date(source.date);
  const storageTo = new Date(source.date);
  const storageDays = sourceType === 'outward' ? storageDaysBetween(storageFrom, storageTo) : 0;
  const inwardAlreadyBilled = Boolean(relatedInward?.invoiceId);
  const sourceInvoiceId = idOf((source as { invoiceId?: unknown }).invoiceId);
  const linkedInvoice = sourceInvoiceId
    ? await InvoiceModel.findOne({ _id: sourceInvoiceId, companyId, status: 'issued', deletedAt: null })
    : null;
  const existing = linkedInvoice ?? (await existingIssuedInvoice(companyId, sourceType, sourceId));

  const items: InvoiceItem[] = [];
  if (sourceType === 'outward' && storageDays > 0) {
    const rate = round2(storageRate * storageDays);
    items.push({
      description: `Cold storage rent (${storageDays} day${storageDays === 1 ? '' : 's'})`,
      hsn,
      quantity,
      unit,
      rate,
      amount: round2(quantity * rate),
    });
  }
  if (inwardHandlingRate > 0 && (sourceType === 'inward' || (relatedInward && !relatedInward.invoiceId))) {
    items.push({
      description: 'Inward handling charges',
      hsn,
      quantity,
      unit,
      rate: inwardHandlingRate,
      amount: round2(quantity * inwardHandlingRate),
    });
  }
  if (sourceType === 'outward' && outwardHandlingRate > 0) {
    items.push({
      description: 'Outward handling charges',
      hsn,
      quantity,
      unit,
      rate: outwardHandlingRate,
      amount: round2(quantity * outwardHandlingRate),
    });
  }

  if (!items.length) {
    throw AppError.badRequest('No billable lines for this slip. Check handling and storage rates in settings.');
  }

  const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const gstAmount = round2(subtotal * (gstRate / 100));
  const total = round2(subtotal + gstAmount);

  return {
    sourceType,
    sourceId,
    inwardId: relatedInward ? String(relatedInward._id) : null,
    outwardId: sourceType === 'outward' ? sourceId : null,
    customerId: idOf(source.customerId),
    productId: idOf(source.productId),
    customer: source.customerId,
    product: source.productId,
    sourceNumber: sourceType === 'inward' ? (source as { inwardNumber?: string }).inwardNumber : (source as { outwardNumber?: string }).outwardNumber,
    quantity,
    unit,
    storageFrom: sourceType === 'outward' ? storageFrom : null,
    storageTo: sourceType === 'outward' ? storageTo : null,
    storageDays,
    items,
    subtotal,
    gstRate,
    gstAmount,
    total,
    alreadyBilled: Boolean(existing),
    existingInvoiceId: existing ? String(existing._id) : null,
    existingInvoiceNumber: existing?.invoiceNumber ?? null,
    rates: {
      storageRatePerUnitPerDay: storageRate,
      inwardHandlingRate,
      outwardHandlingRate,
      gstRate,
    },
    inwardAlreadyBilled,
  };
}

export async function previewInvoice(companyId: string, sourceType: SourceType, sourceId: string, rates: RateInput = {}) {
  return buildInvoiceDraft(companyId, sourceType, sourceId, rates);
}

export async function generateInvoice(
  companyId: string,
  input: RateInput & { sourceType: SourceType; sourceId: string; notes?: string; date?: Date },
  actor: AuthUser,
) {
  const draft = await buildInvoiceDraft(companyId, input.sourceType, input.sourceId, input);
  if (draft.alreadyBilled) {
    throw AppError.conflict(`A bill already exists for this ${input.sourceType} (${draft.existingInvoiceNumber})`);
  }

  const settings = await loadSettings(companyId);
  const invoiceNumber = await nextCode(InvoiceModel, companyId, settings.invoicePrefix || 'INV', 'invoiceNumber');
  const invoice = await InvoiceModel.create({
    companyId,
    invoiceNumber,
    date: input.date ? new Date(input.date) : new Date(),
    customerId: draft.customerId,
    sourceType: draft.sourceType,
    sourceId: draft.sourceId,
    inwardId: draft.inwardId,
    outwardId: draft.outwardId,
    productId: draft.productId,
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
  });

  if (input.sourceType === 'inward') {
    await InwardModel.updateOne({ _id: input.sourceId, companyId }, { $set: { invoiceId: invoice._id } });
  } else {
    await OutwardModel.updateOne({ _id: input.sourceId, companyId }, { $set: { invoiceId: invoice._id } });
    if (draft.inwardId && !draft.inwardAlreadyBilled) {
      await InwardModel.updateOne({ _id: draft.inwardId, companyId, invoiceId: null }, { $set: { invoiceId: invoice._id } });
    }
  }

  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE',
    module: 'Invoice',
    recordId: String(invoice._id),
    recordLabel: invoice.invoiceNumber,
  });

  return getInvoice(companyId, String(invoice._id));
}

export async function listInvoices(companyId: string, params: ListParams) {
  const filter: Record<string, unknown> = { companyId, deletedAt: null };
  if (params.status) filter.status = params.status;
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ invoiceNumber: rx }, { notes: rx }];
  }
  const [data, total] = await Promise.all([
    InvoiceModel.find(filter)
      .populate('customerId', 'name code')
      .populate('productId', 'name code')
      .sort({ createdAt: -1 })
      .skip(params.skip)
      .limit(params.limit),
    InvoiceModel.countDocuments(filter),
  ]);
  return { data, total };
}

export async function getInvoice(companyId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) throw AppError.notFound('Invoice not found');
  const invoice = await InvoiceModel.findOne({ _id: id, companyId, deletedAt: null }).populate(invoicePopulate);
  if (!invoice) throw AppError.notFound('Invoice not found');
  const company = await CompanyModel.findById(companyId).select('name legalName mobile email gstin pan address');
  return { invoice, company };
}
