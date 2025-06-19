import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  sub: {
    type: String,
    required: true,
    unique: true,  // 确保一个 Cognito 用户只存一条
  },
  email: {
    type: String,
  },
  role: {
    type: String,
    enum: ['boss', 'waiter', 'demo'],
    required: true,
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: function () {
      return this.role !== 'demo';  // demo 用户可以没有餐馆
    },
  },
}, {
  timestamps: true
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
