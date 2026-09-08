import { prisma } from '../db/prisma.js';
import { serialize, notDeleted, orderField } from '../db/serialize.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { nextCode } from '../utils/codes.js';
import type { AuthUser } from '../types/auth.js';

export type ListParams = {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: 1 | -1;
  search: string;
  status?: string;
};

type MasterDelegate = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  count: (args: unknown) => Promise<number>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
};

const includeMap: Record<string, unknown> = {
  product: { category: true, unit: true },
};

export function makeTenantCrud(options: {
  model: keyof typeof prisma;
  module: string;
  searchFields: string[];
  codePrefix?: string;
  codeField?: string;
  populate?: string;
}) {
  const { model, module, searchFields, codePrefix, codeField = 'code' } = options;
  const delegate = prisma[model] as unknown as MasterDelegate;
  const include = includeMap[String(model)];

  return {
    async list(companyId: string, params: ListParams) {
      const where: Record<string, unknown> = notDeleted({ companyId });
      if (params.status) where.status = params.status;
      if (params.search) {
        where.OR = searchFields.map((field) => ({
          [field]: { contains: params.search, mode: 'insensitive' },
        }));
      }
      const orderBy = { [orderField(params.sortBy)]: params.sortOrder === -1 ? 'desc' : 'asc' };
      const [data, total] = await Promise.all([
        delegate.findMany({
          where,
          orderBy,
          skip: params.skip,
          take: params.limit,
          ...(include ? { include } : {}),
        }),
        delegate.count({ where }),
      ]);
      return { data: serialize(data), total };
    },

    async get(companyId: string, id: string) {
      const doc = await delegate.findFirst({
        where: notDeleted({ id, companyId }),
        ...(include ? { include } : {}),
      });
      if (!doc) throw AppError.notFound(`${module} not found`);
      return serialize(doc);
    },

    async create(companyId: string, input: Record<string, unknown>, actor: AuthUser) {
      const payload: Record<string, unknown> = { ...input, companyId, createdBy: actor.id };
      if (codePrefix && !payload[codeField]) {
        payload[codeField] = await nextCode(delegate, companyId, codePrefix, codeField);
      }
      if (typeof payload[codeField] === 'string') {
        payload[codeField] = String(payload[codeField]).trim().toUpperCase();
      }
      for (const key of ['categoryId', 'unitId', 'chamberId', 'rackId', 'pillarId']) {
        if (payload[key] === '' || payload[key] == null) delete payload[key];
      }
      if (payload[codeField]) {
        const existing = await delegate.findFirst({
          where: notDeleted({ companyId, [codeField]: payload[codeField] }),
        });
        if (existing) throw AppError.conflict(`${module} code already exists`);
      }
      const doc = await delegate.create({ data: payload });
      await writeAudit({
        companyId,
        userId: actor.id,
        userName: actor.name,
        action: 'CREATE',
        module,
        recordId: String(doc.id),
        recordLabel: String(doc.name ?? doc[codeField] ?? doc.id),
      });
      return serialize(doc);
    },

    async update(companyId: string, id: string, input: Record<string, unknown>, actor: AuthUser) {
      const doc = await delegate.findFirst({ where: notDeleted({ id, companyId }) });
      if (!doc) throw AppError.notFound(`${module} not found`);
      const payload = { ...input };
      if (payload[codeField]) {
        payload[codeField] = String(payload[codeField]).trim().toUpperCase();
        const existing = await delegate.findFirst({
          where: {
            companyId,
            [codeField]: payload[codeField],
            deletedAt: null,
            NOT: { id },
          },
        });
        if (existing) throw AppError.conflict(`${module} code already exists`);
      }
      for (const key of ['categoryId', 'unitId', 'chamberId', 'rackId', 'pillarId']) {
        if (payload[key] === '') payload[key] = null;
      }
      const updated = await delegate.update({
        where: { id },
        data: { ...payload, updatedBy: actor.id },
      });
      await writeAudit({
        companyId,
        userId: actor.id,
        userName: actor.name,
        action: 'UPDATE',
        module,
        recordId: id,
        recordLabel: String(updated.name ?? updated[codeField] ?? id),
      });
      return serialize(updated);
    },

    async remove(companyId: string, id: string, actor: AuthUser) {
      const doc = await delegate.findFirst({ where: notDeleted({ id, companyId }) });
      if (!doc) throw AppError.notFound(`${module} not found`);
      const updated = await delegate.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: actor.id, status: 'inactive' },
      });
      await writeAudit({
        companyId,
        userId: actor.id,
        userName: actor.name,
        action: 'DELETE',
        module,
        recordId: id,
        recordLabel: String(doc.name ?? doc[codeField] ?? id),
      });
      return serialize(updated);
    },
  };
}
