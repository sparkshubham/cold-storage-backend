import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { ROLE_CODES } from '../config/constants.js';
import { SYSTEM_ROLES } from '../config/roles.js';
import { CompanyModel } from '../models/Company.js';
import { PlanModel } from '../models/Plan.js';
import { SubscriptionModel } from '../models/Subscription.js';
import { RoleModel } from '../models/Role.js';
import { UserModel } from '../models/User.js';
import { SettingsModel } from '../models/Settings.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from '../utils/audit.js';
import { escapeRegex } from '../utils/pagination.js';
import { withTransaction } from '../utils/transaction.js';
function addMonths(date, months) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
}
export async function createCompanyRoles(companyId, actorId, session) {
    const templates = SYSTEM_ROLES.filter((r) => !r.isPlatform);
    const docs = templates.map((role) => ({
        name: role.name,
        code: role.code,
        description: role.description,
        isSystem: true,
        permissionKeys: role.permissionKeys,
        companyId,
        createdBy: actorId ?? null,
    }));
    await RoleModel.insertMany(docs, { session });
}
export async function createCompany(input, actor) {
    const email = input.email.toLowerCase();
    const adminEmail = input.adminEmail.toLowerCase();
    const existingCompany = await CompanyModel.findOne({ email, deletedAt: null });
    if (existingCompany) {
        throw AppError.conflict('A company with this email already exists');
    }
    const existingUser = await UserModel.findOne({ email: adminEmail, deletedAt: null });
    if (existingUser) {
        throw AppError.conflict('A user with this admin email already exists');
    }
    const plan = input.planId ? await PlanModel.findOne({ _id: input.planId, deletedAt: null }) : await PlanModel.findOne({ code: 'BASIC', deletedAt: null });
    const company = await withTransaction(async (session) => {
        const [created] = await CompanyModel.create([
            {
                name: input.name,
                legalName: input.legalName ?? '',
                ownerName: input.ownerName ?? '',
                mobile: input.mobile,
                email,
                gstin: input.gstin ?? '',
                pan: input.pan ?? '',
                address: input.address ?? {},
                storageCapacity: input.storageCapacity ?? 0,
                capacityUnit: input.capacityUnit ?? 'MT',
                chamberCount: input.chamberCount ?? 0,
                planId: plan?._id ?? null,
                status: 'trial',
                createdBy: actor.id,
            },
        ], { session });
        let subscriptionId = null;
        if (plan) {
            const start = new Date();
            const [subscription] = await SubscriptionModel.create([
                {
                    companyId: created._id,
                    planId: plan._id,
                    status: 'trial',
                    startDate: start,
                    endDate: addMonths(start, plan.billingCycle === 'yearly' ? 12 : 1),
                    trialEndsAt: addMonths(start, 1),
                    amount: plan.price,
                    createdBy: actor.id,
                },
            ], { session });
            subscriptionId = subscription._id;
            created.subscriptionId = subscription._id;
            await created.save({ session });
        }
        await createCompanyRoles(String(created._id), actor.id, session);
        const adminRole = await RoleModel.findOne({ companyId: created._id, code: ROLE_CODES.COMPANY_ADMIN }).session(session ?? null);
        if (!adminRole) {
            throw AppError.badRequest('Failed to create company admin role');
        }
        await UserModel.create([
            {
                name: input.adminName,
                email: adminEmail,
                mobile: input.adminMobile ?? '',
                passwordHash: await bcrypt.hash(input.adminPassword, env.BCRYPT_SALT_ROUNDS),
                roleId: adminRole._id,
                roleCode: ROLE_CODES.COMPANY_ADMIN,
                companyId: created._id,
                status: 'active',
                createdBy: actor.id,
            },
        ], { session });
        await SettingsModel.create([
            {
                companyId: created._id,
                scope: 'company',
            },
        ], { session });
        void subscriptionId;
        return created;
    });
    await writeAudit({
        companyId: String(company._id),
        userId: actor.id,
        userName: actor.name,
        action: 'CREATE',
        module: 'Company',
        recordId: String(company._id),
        recordLabel: company.name,
        newValue: { name: company.name, email: company.email },
    });
    return company;
}
export async function listCompanies(params) {
    const filter = { deletedAt: null };
    if (params.status) {
        filter.status = params.status;
    }
    if (params.search) {
        const rx = new RegExp(escapeRegex(params.search), 'i');
        filter.$or = [{ name: rx }, { email: rx }, { mobile: rx }, { gstin: rx }, { legalName: rx }];
    }
    const [data, total] = await Promise.all([
        CompanyModel.find(filter)
            .populate('planId', 'name code price billingCycle')
            .populate('subscriptionId', 'status startDate endDate')
            .sort({ [params.sortBy]: params.sortOrder })
            .skip(params.skip)
            .limit(params.limit),
        CompanyModel.countDocuments(filter),
    ]);
    return { data, total };
}
export async function getCompany(id) {
    const company = await CompanyModel.findOne({ _id: id, deletedAt: null })
        .populate('planId', 'name code price billingCycle maxUsers maxChambers maxStorage maxCustomers features')
        .populate('subscriptionId');
    if (!company) {
        throw AppError.notFound('Company not found');
    }
    const [userCount, admin] = await Promise.all([
        UserModel.countDocuments({ companyId: id, deletedAt: null }),
        UserModel.findOne({ companyId: id, roleCode: ROLE_CODES.COMPANY_ADMIN, deletedAt: null }).select('name email mobile status lastLoginAt'),
    ]);
    return { company, userCount, admin };
}
export async function updateCompany(id, input, actor) {
    const company = await CompanyModel.findOne({ _id: id, deletedAt: null });
    if (!company) {
        throw AppError.notFound('Company not found');
    }
    const oldValue = company.toObject();
    Object.assign(company, input, { updatedBy: actor.id });
    await company.save();
    await writeAudit({
        companyId: id,
        userId: actor.id,
        userName: actor.name,
        action: 'UPDATE',
        module: 'Company',
        recordId: id,
        recordLabel: company.name,
        oldValue: { name: oldValue.name, status: oldValue.status },
        newValue: { name: company.name, status: company.status },
    });
    return company;
}
export async function setCompanyStatus(id, status, actor) {
    const company = await CompanyModel.findOne({ _id: id, deletedAt: null });
    if (!company) {
        throw AppError.notFound('Company not found');
    }
    const previous = company.status;
    company.status = status;
    company.updatedBy = actor.id;
    await company.save();
    await writeAudit({
        companyId: id,
        userId: actor.id,
        userName: actor.name,
        action: status === 'suspended' ? 'SUSPEND' : 'ACTIVATE',
        module: 'Company',
        recordId: id,
        recordLabel: company.name,
        oldValue: { status: previous },
        newValue: { status },
    });
    return company;
}
export async function softDeleteCompany(id, actor) {
    const company = await CompanyModel.findOne({ _id: id, deletedAt: null });
    if (!company) {
        throw AppError.notFound('Company not found');
    }
    company.deletedAt = new Date();
    company.deletedBy = actor.id;
    company.status = 'deleted';
    await company.save();
    await UserModel.updateMany({ companyId: id, deletedAt: null }, { $set: { status: 'suspended', updatedBy: actor.id } });
    await writeAudit({
        companyId: id,
        userId: actor.id,
        userName: actor.name,
        action: 'DELETE',
        module: 'Company',
        recordId: id,
        recordLabel: company.name,
    });
    return company;
}
//# sourceMappingURL=company.service.js.map