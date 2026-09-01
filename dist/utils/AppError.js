export class AppError extends Error {
    statusCode;
    isOperational;
    errors;
    constructor(message, statusCode = 500, errors) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        this.errors = errors;
        Object.setPrototypeOf(this, AppError.prototype);
    }
    static badRequest(message, errors) {
        return new AppError(message, 400, errors);
    }
    static unauthorized(message = 'Unauthorized') {
        return new AppError(message, 401);
    }
    static forbidden(message = 'Forbidden') {
        return new AppError(message, 403);
    }
    static notFound(message = 'Resource not found') {
        return new AppError(message, 404);
    }
    static conflict(message, errors) {
        return new AppError(message, 409, errors);
    }
    static validation(message = 'Validation failed', errors) {
        return new AppError(message, 422, errors);
    }
    static tooMany(message = 'Too many requests') {
        return new AppError(message, 429);
    }
}
//# sourceMappingURL=AppError.js.map