import { Schema } from 'mongoose';
export function softDeletePlugin(schema) {
    schema.add({
        deletedAt: { type: Date, default: null },
        deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    });
}
export function tenantPlugin(schema, required = true) {
    schema.add({
        companyId: {
            type: Schema.Types.ObjectId,
            ref: 'Company',
            required,
            index: true,
            default: null,
        },
    });
}
export function actorPlugin(schema) {
    schema.add({
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    });
}
//# sourceMappingURL=plugins.js.map