import type { Model } from 'mongoose';

export async function nextCode(
  model: Model<any>,
  companyId: string,
  prefix: string,
  field = 'code',
  width = 6,
) {
  const count = await model.countDocuments({ companyId });
  return `${prefix}-${String(count + 1).padStart(width, '0')}`;
}
