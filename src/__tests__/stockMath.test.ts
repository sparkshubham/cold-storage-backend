import { describe, expect, it } from 'vitest';
import { applyOccupancyDelta, applyQuantityDelta, occupancyPercent } from '../utils/stockMath.js';

describe('stock math', () => {
  it('rejects negative quantity', () => {
    expect(() => applyQuantityDelta(5, -6)).toThrow('NEGATIVE_QUANTITY');
  });

  it('rejects occupancy below zero', () => {
    expect(() => applyOccupancyDelta(5, -6, 100)).toThrow('NEGATIVE_OCCUPANCY');
  });

  it('rejects capacity overflow', () => {
    expect(() => applyOccupancyDelta(90, 20, 100)).toThrow('CAPACITY_EXCEEDED');
  });

  it('computes occupancy percent', () => {
    expect(occupancyPercent(25, 100)).toBe(25);
  });
});
