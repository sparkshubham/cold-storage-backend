import { AppError } from '../utils/AppError.js';
export function validate(schema, source = 'body') {
    return (req, _res, next) => {
        const result = schema.safeParse(req[source]);
        if (!result.success) {
            return next(AppError.validation('Validation failed', result.error.flatten()));
        }
        req[source] = result.data;
        next();
    };
}
//# sourceMappingURL=validate.js.map