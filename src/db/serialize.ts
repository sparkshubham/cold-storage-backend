/** Map Prisma `id` to Mongo-compatible `_id` for the existing frontend. */
export function serialize<T>(value: T): T {
  return mapValue(value) as T;
}

function mapValue(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(mapValue);
  if (typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (key === 'passwordHash' || key === 'resetPasswordTokenHash') continue;
    if (key === 'id') {
      out._id = child;
      out.id = child;
      continue;
    }
    out[key] = mapValue(child);
  }

  // Flatten company address columns back to nested `address` for API parity.
  if ('addressLine1' in out || 'addressCity' in out) {
    out.address = {
      line1: out.addressLine1 ?? '',
      line2: out.addressLine2 ?? '',
      city: out.addressCity ?? '',
      state: out.addressState ?? '',
      pincode: out.addressPincode ?? '',
    };
    delete out.addressLine1;
    delete out.addressLine2;
    delete out.addressCity;
    delete out.addressState;
    delete out.addressPincode;
  }

  return out;
}

export function notDeleted<T extends Record<string, unknown>>(extra: T = {} as T) {
  return { deletedAt: null, ...extra };
}

export function companyAddressFields(address: unknown) {
  const obj = (address && typeof address === 'object' ? address : {}) as Record<string, unknown>;
  return {
    addressLine1: String(obj.line1 ?? obj.addressLine1 ?? ''),
    addressLine2: String(obj.line2 ?? obj.addressLine2 ?? ''),
    addressCity: String(obj.city ?? obj.addressCity ?? ''),
    addressState: String(obj.state ?? obj.addressState ?? ''),
    addressPincode: String(obj.pincode ?? obj.addressPincode ?? ''),
  };
}

/** Remap Prisma relation keys (e.g. `customer`) to mongoose-style populated fields (`customerId`). */
export function withPopulated(row: Record<string, unknown>, map: Record<string, string>) {
  const out: Record<string, unknown> = { ...row };
  for (const [rel, field] of Object.entries(map)) {
    if (out[rel]) {
      out[field] = out[rel];
      delete out[rel];
    }
  }
  return serialize(out);
}

export function orderField(sortBy: string) {
  return sortBy === '_id' ? 'id' : sortBy;
}
