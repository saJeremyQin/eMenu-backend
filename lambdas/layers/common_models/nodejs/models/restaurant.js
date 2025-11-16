import mongoose from "mongoose";

// Test: Layer change for CI/CD testing - updated at 2025-10-09-v3 (dependency test)
const RestaurantSchema = new mongoose.Schema({
  bossId: { type: String, required: true }, // 改为 String 类型存储 cognitoId
  name: { type: String, required: true },
  logoUrl: String,
  address: String,
  phone: String,
  subscriptionPlan: { type: String, enum: ['BASIC', 'PREMIUM'], required: true, default: 'BASIC' },
  subscriptionExpiry: String, // 可为 null
  dishTypeLimit: { type: Number, required: true, default: 3 },
  dishLimit: { type: Number, required: true, default: 5 },
  waiterLimit: { type: Number, required: true, default: 1 },
  waiters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] // User id数组
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

const Restaurant = mongoose.models.Restaurant || mongoose.model('Restaurant', RestaurantSchema);
export default Restaurant;