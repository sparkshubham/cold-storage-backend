import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
export function getAuthUser(req) {
    if (!req.authUser) {
        throw AppError.unauthorized();
    }
    return req.authUser;
}
export function requireTenantId(req) {
    const user = getAuthUser(req);
    const tenantId = req.tenantId ?? user.companyId;
    if (!tenantId) {
        throw AppError.badRequest('Company context is required');
    }
    return tenantId;
}
export function toObjectId(id) {
    return new mongoose.Types.ObjectId(id);
}
//# sourceMappingURL=auth.js.map