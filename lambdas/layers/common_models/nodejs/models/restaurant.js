import mongoose from "mongoose";

const RestaurantSchema = new mongoose.Schema({
  bossId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  image: String,
  address: String,
  subscriptionPlan: { type: String, enum: ['BASIC', 'PREMIUM'], required: true },
  subscriptionExpiry: { type: String, required: true },
  dishTypeLimit: { type: Number, required: true },
  dishLimit: { type: Number, required: true },
  waiterLimit: { type: Number, required: true },
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