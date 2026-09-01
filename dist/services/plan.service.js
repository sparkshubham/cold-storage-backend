import { PlanModel } from '../models/Plan.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { escapeRegex } from '../utils/pagination.js';
export async function createPlan(input, actor) {
    const code = String(input.code).toUpperCase();
    const existing = await PlanModel.findOne({ code, deletedAt: null });
    if (existing) {
        throw AppError.conflict('Plan code already exists');
    }
    const plan = await PlanModel.create({ ...input, code, createdBy: actor.id });
    await writeAudit({
        userId: actor.id,
        userName: actor.name,
        action: 'CREATE',
        module: 'Plan',
        recordId: String(plan._id),
        recordLabel: plan.name,
    });
    return plan;
}
export async function listPlans(params) {
    const filter = { deletedAt: null };
    if (params.search) {
        const rx = new RegExp(escapeRegex(params.search), 'i');
        filter.$or = [{ name: rx }, { code: rx }];
    }
    const [data, total] = await Promise.all([
        PlanModel.find(filter)
            .sort({ [params.sortBy]: params.sortOrder })
            .skip(params.skip)
            .limit(params.limit),
        PlanModel.countDocuments(filter),
    ]);
    return { data, total };
}
export async function getPlan(id) {
    const plan = await PlanModel.findOne({ _id: id, deletedAt: null });
    if (!plan) {
        throw AppError.notFound('Plan not found');
    }
    return plan;
}
export async function updatePlan(id, input, actor) {
    const plan = await PlanModel.findOne({ _id: id, deletedAt: null });
    if (!plan) {
        throw AppError.notFound('Plan not found');
    }
    if (input.code) {
        input.code = String(input.code).toUpperCase();
    }
    Object.assign(plan, input, { updatedBy: actor.id });
    await plan.save();
    await writeAudit({
        userId: actor.id,
        userName: actor.name,
        action: 'UPDATE',
        module: 'Plan',
        recordId: id,
        recordLabel: plan.name,
    });
    return plan;
}
export async function softDeletePlan(id, actor) {
    const plan = await PlanModel.findOne({ _id: id, deletedAt: null });
    if (!plan) {
        throw AppError.notFound('Plan not found');
    }
    plan.deletedAt = new Date();
    plan.deletedBy = actor.id;
    plan.isActive = false;
    await plan.save();
    await writeAudit({
        userId: actor.id,
        userName: actor.name,
        action: 'DELETE',
        module: 'Plan',
        recordId: id,
        recordLabel: plan.name,
    });
    return plan;
}
//# sourceMappingURL=plan.service.js.map