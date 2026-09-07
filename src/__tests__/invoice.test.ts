import { describe, expect, it } from 'vitest';
import { ratesForUnit, storageDaysBetween } from '../services/invoice.service.js';
import { handlingChargeQty, handlingChargeUnit } from '../utils/billingQty.js';

describe('storage days', () => {
  it('charges at least one day for same-day outward', () => {
    expect(storageDaysBetween(new Date('2026-08-01'), new Date('2026-08-01'))).toBe(1);
  });

  it('counts calendar days from inward to outward', () => {
    expect(storageDaysBetween(new Date('2026-08-01'), new Date('2026-08-11'))).toBe(10);
  });
});

describe('rates by unit', () => {
  const settings = {
    storageRatePerUnitPerDay: 20,
    inwardHandlingRate: 40,
    outwardHandlingRate: 40,
    defaultGstRate: 18,
    unitRates: [
      { unit: 'MT', storageRatePerUnitPerDay: 20, inwardHandlingRate: 40, outwardHandlingRate: 40 },
      { unit: 'BAG', storageRatePerUnitPerDay: 2, inwardHandlingRate: 5, outwardHandlingRate: 5 },
    ],
  };

  it('uses the matching unit row for bags', () => {
    const rates = ratesForUnit(settings, 'bag');
    expect(rates.rateSource).toBe('unit');
    expect(rates.storageRatePerUnitPerDay).toBe(2);
    expect(rates.inwardHandlingRate).toBe(5);
  });

  it('falls back to company defaults when the unit is missing', () => {
    const rates = ratesForUnit(settings, 'QTL');
    expect(rates.rateSource).toBe('default');
    expect(rates.storageRatePerUnitPerDay).toBe(20);
  });

  it('lets a bill override the saved unit rate', () => {
    const rates = ratesForUnit(settings, 'BAG', { storageRatePerUnitPerDay: 3 });
    expect(rates.storageRatePerUnitPerDay).toBe(3);
    expect(rates.inwardHandlingRate).toBe(5);
  });
});

describe('weight-based handling', () => {
  it('uses slip weight when basis is weight', () => {
    const slip = { quantity: 10, unit: 'BAG', weight: 500, weightUnit: 'KG' };
    expect(handlingChargeQty(slip, { handlingChargeBasis: 'weight', handlingWeightUnit: 'KG' })).toBe(500);
    expect(handlingChargeUnit(slip, { handlingChargeBasis: 'weight', handlingWeightUnit: 'KG' })).toBe('KG');
  });

  it('falls back to packing qty when weight is missing', () => {
    const slip = { quantity: 10, unit: 'BAG', weight: 0, weightUnit: 'KG' };
    expect(handlingChargeQty(slip, { handlingChargeBasis: 'weight', handlingWeightUnit: 'KG' })).toBe(10);
    expect(handlingChargeUnit(slip, { handlingChargeBasis: 'weight', handlingWeightUnit: 'KG' })).toBe('BAG');
  });

  it('converts MT weight into KG for handling', () => {
    const slip = { quantity: 2, unit: 'BAG', weight: 1.5, weightUnit: 'MT' };
    expect(handlingChargeQty(slip, { handlingChargeBasis: 'weight', handlingWeightUnit: 'KG' })).toBe(1500);
  });
});
