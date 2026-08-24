export function applyQuantityDelta(current: number, delta: number) {
  const next = Number(current) + Number(delta);
  if (next < 0) {
    throw new Error('NEGATIVE_QUANTITY');
  }
  return next;
}

export function applyOccupancyDelta(occupied: number, delta: number, capacity: number) {
  const next = Number(occupied) + Number(delta);
  if (next < 0) {
    throw new Error('NEGATIVE_OCCUPANCY');
  }
  if (next > Number(capacity)) {
    throw new Error('CAPACITY_EXCEEDED');
  }
  return next;
}

export function occupancyPercent(occupied: number, capacity: number) {
  if (!capacity) return 0;
  return Math.round((Number(occupied) / Number(capacity)) * 10000) / 100;
}
