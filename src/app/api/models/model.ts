import { Model, Schema, model, models } from 'mongoose';

interface AdminType {
  publicKey: string;
  password: string;
}

const AdminSchema = new Schema({
  publicKey: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
});

export const Admin: Model<AdminType> = models.AdminData || model<AdminType>('AdminData', AdminSchema, 'AdminData');
