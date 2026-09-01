import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
export function notFoundHandler(req, _res, next) {
    next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
export function errorHandler(err, _req, res, _next) {
    if (err instanceof ZodError) {
        return res.status(422).json({
            success: false,
            message: 'Validation failed',
            errors: err.flatten(),
        });
    }
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            errors: err.errors ?? undefined,
        });
    }
    logger.error({ err }, 'Unhandled error');
    return res.status(500).json({
        success: false,
        message: isProduction ? 'Internal server error' : err instanceof Error ? err.message : 'Internal server error',
    });
}
//# sourceMappingURL=errorHandler.js.map