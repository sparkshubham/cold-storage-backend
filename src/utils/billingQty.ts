export function toKg(weight: number, unit: string) {
  const code = String(unit ?? 'KG').trim().toUpperCase();
  if (code === 'MT' || code === 'TON' || code === 'TONNE') return Number(weight) * 1000;
  if (code === 'Q' || code === 'QTL' || code === 'QUINTAL') return Number(weight) * 100;
  return Number(weight) || 0;
}

export function fromKg(kg: number, unit: string) {
  const code = String(unit ?? 'KG').trim().toUpperCase();
  if (code === 'MT' || code === 'TON' || code === 'TONNE') return kg / 1000;
  if (code === 'Q' || code === 'QTL' || code === 'QUINTAL') return kg / 100;
  return kg;
}

export function handlingChargeQty(
  slip: { quantity?: unknown; unit?: unknown; weight?: unknown; weightUnit?: unknown },
  settings: { handlingChargeBasis?: string; handlingWeightUnit?: string },
) {
  const basis = settings.handlingChargeBasis === 'quantity' ? 'quantity' : 'weight';
  const weight = Number(slip.weight ?? 0);
  if (basis === 'weight' && weight > 0) {
    const kg = toKg(weight, String(slip.weightUnit || 'KG'));
    return fromKg(kg, settings.handlingWeightUnit || 'KG');
  }
  return Number(slip.quantity ?? 0);
}

export function handlingChargeUnit(
  slip: { quantity?: unknown; unit?: unknown; weight?: unknown; weightUnit?: unknown },
  settings: { handlingChargeBasis?: string; handlingWeightUnit?: string },
) {
  const basis = settings.handlingChargeBasis === 'quantity' ? 'quantity' : 'weight';
  if (basis === 'weight' && Number(slip.weight ?? 0) > 0) {
    return String(settings.handlingWeightUnit || 'KG').toUpperCase();
  }
  return String(slip.unit ?? '');
}
