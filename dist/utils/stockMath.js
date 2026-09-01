export function applyQuantityDelta(current, delta) {
    const next = Number(current) + Number(delta);
    if (next < 0) {
        throw new Error('NEGATIVE_QUANTITY');
    }
    return next;
}
export function applyOccupancyDelta(occupied, delta, capacity) {
    const next = Number(occupied) + Number(delta);
    if (next < 0) {
        throw new Error('NEGATIVE_OCCUPANCY');
    }
    if (next > Number(capacity)) {
        throw new Error('CAPACITY_EXCEEDED');
    }
    return next;
}
export function occupancyPercent(occupied, capacity) {
    if (!capacity)
        return 0;
    return Math.round((Number(occupied) / Number(capacity)) * 10000) / 100;
}
//# sourceMappingURL=stockMath.js.map