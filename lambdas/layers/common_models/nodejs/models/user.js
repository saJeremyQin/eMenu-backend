import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  sub: {
    type: String,
    required: true,
    unique: true,  // ensure it is unique, from cognito userSub
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  role: {
    type: String,
    enum: ['boss', 'waiter', 'demo','admin'],
    required: true,
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: false
  },
}, {
  timestamps: true,
    toJSON: {
    virtuals: true,        // 添加虚拟字段（id）
    versionKey: false,     // 去掉 __v 字段
    transform: (_, ret) => {
      ret.id = ret.sub;  // 映射 _id -> id
      delete ret._id;               // 删除 _id，避免重复
      delete ret.__v;
    }
  }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
