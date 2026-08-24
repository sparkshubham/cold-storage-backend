import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const permissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

export type Permission = InferSchemaType<typeof permissionSchema> & { _id: mongoose.Types.ObjectId };
export const PermissionModel = mongoose.model('Permission', permissionSchema);
