import { prisma } from '../db/prisma.js';
import { serialize } from '../db/serialize.js';
import { writeAudit } from '../utils/audit.js';
import type { AuthUser } from '../types/auth.js';

export const DEFAULT_UNIT_RATES = [
  { unit: 'NOS', storageRatePerUnitPerDay: 1, inwardHandlingRate: 2, outwardHandlingRate: 2 },
  { unit: 'BOX', storageRatePerUnitPerDay: 5, inwardHandlingRate: 8, outwardHandlingRate: 8 },
  { unit: 'TIN', storageRatePerUnitPerDay: 4, inwardHandlingRate: 6, outwardHandlingRate: 6 },
  { unit: 'BAG', storageRatePerUnitPerDay: 2, inwardHandlingRate: 5, outwardHandlingRate: 5 },
  { unit: 'BAGS', storageRatePerUnitPerDay: 2, inwardHandlingRate: 5, outwardHandlingRate: 5 },
  { unit: 'KG', storageRatePerUnitPerDay: 0.25, inwardHandlingRate: 0.5, outwardHandlingRate: 0.5 },
  { unit: 'MT', storageRatePerUnitPerDay: 20, inwardHandlingRate: 40, outwardHandlingRate: 40 },
];

export type CompanySettings = {
  _id?: unknown;
  id?: unknown;
  invoicePrefix?: string;
  defaultGstRate?: number;
  storageRatePerUnitPerDay?: number;
  inwardHandlingRate?: number;
  outwardHandlingRate?: number;
  handlingChargeBasis?: string;
  handlingWeightUnit?: string;
  unitRates?: Array<{
    unit: string;
    storageRatePerUnitPerDay: number;
    inwardHandlingRate: number;
    outwardHandlingRate: number;
  }>;
};

function asUnitRates(value: unknown): CompanySettings['unitRates'] {
  return Array.isArray(value) ? (value as CompanySettings['unitRates']) : [];
}

export async function getSettings(companyId: string) {
  let settings = await prisma.settings.findUnique({ where: { companyId } });
  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        companyId,
        scope: 'company',
        unitRates: DEFAULT_UNIT_RATES,
      },
    });
  } else {
    const current = asUnitRates(settings.unitRates) ?? [];
    const have = new Set(current.map((row) => String(row.unit).toUpperCase()));
    const missing = DEFAULT_UNIT_RATES.filter((row) => !have.has(row.unit));
    if (missing.length) {
      settings = await prisma.settings.update({
        where: { id: settings.id },
        data: { unitRates: [...current, ...missing] },
      });
    }
  }
  return serialize(settings) as unknown as CompanySettings;
}

export async function updateSettings(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  const existing = await getSettings(companyId);
  const data: Record<string, unknown> = {
    scope: 'company',
  };
  if (input.invoicePrefix != null) data.invoicePrefix = String(input.invoicePrefix).toUpperCase();
  if (input.defaultGstRate != null) data.defaultGstRate = Number(input.defaultGstRate);
  if (input.storageRatePerUnitPerDay != null) data.storageRatePerUnitPerDay = Number(input.storageRatePerUnitPerDay);
  if (input.inwardHandlingRate != null) data.inwardHandlingRate = Number(input.inwardHandlingRate);
  if (input.outwardHandlingRate != null) data.outwardHandlingRate = Number(input.outwardHandlingRate);
  if (input.handlingChargeBasis != null) data.handlingChargeBasis = String(input.handlingChargeBasis);
  if (input.handlingWeightUnit != null) data.handlingWeightUnit = String(input.handlingWeightUnit).toUpperCase();
  if (input.unitRates != null) data.unitRates = input.unitRates;

  const settings = await prisma.settings.upsert({
    where: { companyId },
    create: {
      companyId,
      scope: 'company',
      unitRates: input.unitRates ?? DEFAULT_UNIT_RATES,
      invoicePrefix: input.invoicePrefix != null ? String(input.invoicePrefix).toUpperCase() : undefined,
      defaultGstRate: input.defaultGstRate != null ? Number(input.defaultGstRate) : undefined,
      storageRatePerUnitPerDay: input.storageRatePerUnitPerDay != null ? Number(input.storageRatePerUnitPerDay) : undefined,
      inwardHandlingRate: input.inwardHandlingRate != null ? Number(input.inwardHandlingRate) : undefined,
      outwardHandlingRate: input.outwardHandlingRate != null ? Number(input.outwardHandlingRate) : undefined,
      handlingChargeBasis: input.handlingChargeBasis != null ? String(input.handlingChargeBasis) : undefined,
      handlingWeightUnit: input.handlingWeightUnit != null ? String(input.handlingWeightUnit).toUpperCase() : undefined,
    },
    update: data,
  });

  const serialized = serialize(settings) as unknown as CompanySettings;
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Settings',
    recordId: String(settings.id),
    recordLabel: 'Billing settings',
    oldValue: existing,
    newValue: serialized,
  });
  return serialized;
}
