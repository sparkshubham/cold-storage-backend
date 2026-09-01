import mongoose, { Schema } from 'mongoose';
const permissionSchema = new Schema({
    key: { type: String, required: true, unique: true, index: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true },
    description: { type: String, default: '' },
}, { timestamps: true });
export const PermissionModel = mongoose.model('Permission', permissionSchema);
//# sourceMappingURL=Permission.js.map