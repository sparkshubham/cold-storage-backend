import { prisma } from '../db/prisma.js';

type DelegateWithCount = {
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
};

export async function nextCode(
  delegate: DelegateWithCount,
  companyId: string,
  prefix: string,
  _field = 'code',
  width = 6,
) {
  const count = await delegate.count({ where: { companyId } });
  return `${prefix}-${String(count + 1).padStart(width, '0')}`;
}

export async function nextCodeByPrisma(
  table:
    | 'category'
    | 'unit'
    | 'customer'
    | 'supplier'
    | 'product'
    | 'chamber'
    | 'rack'
    | 'pillar'
    | 'location'
    | 'batch'
    | 'inward'
    | 'outward'
    | 'invoice',
  companyId: string,
  prefix: string,
  width = 6,
) {
  const delegate = prisma[table] as unknown as DelegateWithCount;
  return nextCode(delegate, companyId, prefix, 'code', width);
}
