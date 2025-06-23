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
  timestamps: true
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
