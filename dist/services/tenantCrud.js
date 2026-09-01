import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { escapeRegex } from '../utils/pagination.js';
import { nextCode } from '../utils/codes.js';
export function makeTenantCrud(options) {
    const { model, module, searchFields, codePrefix, codeField = 'code', populate } = options;
    return {
        async list(companyId, params) {
            const filter = { companyId, deletedAt: null };
            if (params.status)
                filter.status = params.status;
            if (params.search) {
                const rx = new RegExp(escapeRegex(params.search), 'i');
                filter.$or = searchFields.map((field) => ({ [field]: rx }));
            }
            let query = model.find(filter).sort({ [params.sortBy]: params.sortOrder }).skip(params.skip).limit(params.limit);
            if (populate) {
                for (const path of populate.split(/\s+/)) {
                    query = query.populate(path);
                }
            }
            const [data, total] = await Promise.all([query, model.countDocuments(filter)]);
            return { data, total };
        },
        async get(companyId, id) {
            let query = model.findOne({ _id: id, companyId, deletedAt: null });
            if (populate) {
                for (const path of populate.split(/\s+/)) {
                    query = query.populate(path);
                }
            }
            const doc = await query;
            if (!doc)
                throw AppError.notFound(`${module} not found`);
            return doc;
        },
        async create(companyId, input, actor) {
            const payload = { ...input, companyId, createdBy: actor.id };
            if (codePrefix && !payload[codeField]) {
                payload[codeField] = await nextCode(model, companyId, codePrefix, codeField);
            }
            if (typeof payload[codeField] === 'string') {
                payload[codeField] = String(payload[codeField]).trim().toUpperCase();
            }
            if (payload[codeField]) {
                const existing = await model.findOne({ companyId, [codeField]: payload[codeField], deletedAt: null });
                if (existing)
                    throw AppError.conflict(`${module} code already exists`);
            }
            const doc = await model.create(payload);
            await writeAudit({
                companyId,
                userId: actor.id,
                userName: actor.name,
                action: 'CREATE',
                module,
                recordId: String(doc._id),
                recordLabel: String(doc.get('name') ?? doc.get(codeField) ?? doc._id),
            });
            return doc;
        },
        async update(companyId, id, input, actor) {
            const doc = await model.findOne({ _id: id, companyId, deletedAt: null });
            if (!doc)
                throw AppError.notFound(`${module} not found`);
            if (input[codeField]) {
                input[codeField] = String(input[codeField]).trim().toUpperCase();
                const existing = await model.findOne({
                    companyId,
                    [codeField]: input[codeField],
                    deletedAt: null,
                    _id: { $ne: id },
                });
                if (existing)
                    throw AppError.conflict(`${module} code already exists`);
            }
            Object.assign(doc, input, { updatedBy: actor.id });
            await doc.save();
            await writeAudit({
                companyId,
                userId: actor.id,
                userName: actor.name,
                action: 'UPDATE',
                module,
                recordId: id,
                recordLabel: String(doc.get('name') ?? doc.get(codeField) ?? id),
            });
            return doc;
        },
        async remove(companyId, id, actor) {
            const doc = await model.findOne({ _id: id, companyId, deletedAt: null });
            if (!doc)
                throw AppError.notFound(`${module} not found`);
            doc.set({ deletedAt: new Date(), deletedBy: actor.id, status: 'inactive' });
            await doc.save();
            await writeAudit({
                companyId,
                userId: actor.id,
                userName: actor.name,
                action: 'DELETE',
                module,
                recordId: id,
                recordLabel: String(doc.get('name') ?? doc.get(codeField) ?? id),
            });
            return doc;
        },
    };
}
//# sourceMappingURL=tenantCrud.js.map