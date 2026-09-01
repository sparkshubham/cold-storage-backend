import { describe, expect, it } from 'vitest';
import { ratesForUnit, storageDaysBetween } from '../services/invoice.service.js';

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
