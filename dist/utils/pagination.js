import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '../config/constants.js';
export function getPagination(req) {
    const page = Math.max(Number(req.query.page) || DEFAULT_PAGE, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const skip = (page - 1) * limit;
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    return { page, limit, skip, sortBy, sortOrder, search };
}
export function routeParam(req, key) {
    const value = req.params[key];
    return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
export function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function queryString(req, key) {
    const value = req.query[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
//# sourceMappingURL=pagination.js.map