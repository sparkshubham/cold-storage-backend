import { SettingsModel } from '../models/Settings.js';
import { writeAudit } from '../utils/audit.js';
import type { AuthUser } from '../types/auth.js';

export const DEFAULT_UNIT_RATES = [
  { unit: 'MT', storageRatePerUnitPerDay: 20, inwardHandlingRate: 40, outwardHandlingRate: 40 },
  { unit: 'BAG', storageRatePerUnitPerDay: 2, inwardHandlingRate: 5, outwardHandlingRate: 5 },
  { unit: 'KG', storageRatePerUnitPerDay: 0.25, inwardHandlingRate: 0.5, outwardHandlingRate: 0.5 },
];

export type CompanySettings = {
  _id?: unknown;
  invoicePrefix?: string;
  defaultGstRate?: number;
  storageRatePerUnitPerDay?: number;
  inwardHandlingRate?: number;
  outwardHandlingRate?: number;
  unitRates?: Array<{
    unit: string;
    storageRatePerUnitPerDay: number;
    inwardHandlingRate: number;
    outwardHandlingRate: number;
  }>;
};

function asObject(doc: { toObject?: () => CompanySettings } | CompanySettings | null): CompanySettings {
  if (doc && typeof doc === 'object' && 'toObject' in doc && typeof doc.toObject === 'function') {
    return doc.toObject();
  }
  return (doc ?? {}) as CompanySettings;
}

export async function getSettings(companyId: string) {
  let settings = await SettingsModel.findOne({ companyId });
  if (!settings) {
    settings = await SettingsModel.create({
      companyId,
      scope: 'company',
      unitRates: DEFAULT_UNIT_RATES,
    });
  } else if (!settings.unitRates?.length) {
    settings.unitRates = DEFAULT_UNIT_RATES as typeof settings.unitRates;
    await settings.save();
  }
  return asObject(settings);
}

export async function updateSettings(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
  const existing = await getSettings(companyId);
  const settings = await SettingsModel.findOneAndUpdate(
    { companyId },
    {
      $set: {
        scope: 'company',
        ...(input.invoicePrefix != null ? { invoicePrefix: String(input.invoicePrefix).toUpperCase() } : {}),
        ...(input.defaultGstRate != null ? { defaultGstRate: Number(input.defaultGstRate) } : {}),
        ...(input.storageRatePerUnitPerDay != null ? { storageRatePerUnitPerDay: Number(input.storageRatePerUnitPerDay) } : {}),
        ...(input.inwardHandlingRate != null ? { inwardHandlingRate: Number(input.inwardHandlingRate) } : {}),
        ...(input.outwardHandlingRate != null ? { outwardHandlingRate: Number(input.outwardHandlingRate) } : {}),
        ...(input.unitRates != null ? { unitRates: input.unitRates } : {}),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  await writeAudit({
    companyId,
    userId: actor.id,
    userName: actor.name,
    action: 'UPDATE',
    module: 'Settings',
    recordId: String(settings?._id ?? companyId),
    recordLabel: 'Billing settings',
    oldValue: existing,
    newValue: asObject(settings ?? {}),
  });
  return asObject(settings ?? {});
}
