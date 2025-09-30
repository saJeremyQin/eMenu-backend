import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  cognitoId: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String, enum: ['boss', 'waiter'], required: true },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
  isDeleted: { type: Boolean, required: true }
}, { 
  timestamps: true,
  toJSON: {
      virtuals: true,                   // add virtual field（id）
      versionKey: false,                // 去掉 __v 字段
      transform: (_, ret) => {
          ret.id = ret._id.toString();  // 映射 _id -> id
          delete ret._id;               // 删除 _id，避免重复
      }
  }
 });

const User = mongoose.models.User || mongoose.model('User', UserSchema);
export default User;