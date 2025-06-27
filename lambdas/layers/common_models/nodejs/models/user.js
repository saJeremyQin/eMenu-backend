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
    virtuals: true,                 // add virtual field（id）
    versionKey: false,              // remove __v field
    transform: (_, ret) => {
      ret.id = ret.sub;             // map _id -> id
      delete ret._id;               // delete _id，avoid duplicate
      delete ret.__v;
    }
  }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
