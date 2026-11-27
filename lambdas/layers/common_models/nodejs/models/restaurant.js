import mongoose from "mongoose";

// subscriptionPlan values must match SUBSCRIPTION_LIMITS in emenu_server/config/constants.js.
// Plan limits are derived from subscriptionPlan there, not stored here. (Older documents
// may still hold dishTypeLimit/dishLimit/waiterLimit/tableLimit; they are ignored.)
const RestaurantSchema = new mongoose.Schema({
  bossId: { type: String, required: true }, // 改为 String 类型存储 cognitoId
  name: { type: String, required: true },
  logoUrl: String,
  address: String,
  phone: String,
  subscriptionPlan: { type: String, enum: ['FREE', 'PRO'], required: true, default: 'FREE' },
  subscriptionExpiry: String, // 可为 null
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