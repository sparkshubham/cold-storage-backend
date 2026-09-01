export function success(res, data, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({ success: true, message, data });
}
export function created(res, data, message = 'Created successfully') {
    return success(res, data, message, 201);
}
export function paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
        success: true,
        message,
        data,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: Math.ceil(pagination.total / pagination.limit) || 0,
        },
    });
}
//# sourceMappingURL=apiResponse.js.map