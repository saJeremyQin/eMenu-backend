import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  sub: {
    type: String,
    required: true,
    unique: true,  // 确保一个 Cognito 用户只存一条
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
  timestamps: true
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
