import { describe, expect, it } from 'vitest';
import { storageDaysBetween } from '../services/invoice.service.js';

describe('storage days', () => {
  it('charges at least one day for same-day outward', () => {
    expect(storageDaysBetween(new Date('2026-08-01'), new Date('2026-08-01'))).toBe(1);
  });

  it('counts calendar days from inward to outward', () => {
    expect(storageDaysBetween(new Date('2026-08-01'), new Date('2026-08-11'))).toBe(10);
  });
});
