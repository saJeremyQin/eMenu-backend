
import mongoose from "mongoose";

const restaurantSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    image: { 
        type: String 
    },
    address: { 
        type: String 
    },
    bossId: { 
        type: String, 
        required: true 
    },
    subscriptionPlan: { 
        type: String, 
        enum: ['BASIC', 'PREMIUM'], 
        default: 'BASIC' 
    },
    subscriptionExpiry: { 
        type: Date 
    },
}, 
{
    timestamps: true,
    toJSON: {
      virtuals: true,        // 添加虚拟字段（id）
      versionKey: false,     // 去掉 __v 字段
      transform: (_, ret) => {
        ret.id = ret._id.toString();  // 映射 _id -> id
        delete ret._id;               // 删除 _id，避免重复
      }
    }
});

const Restaurant = mongoose.models.Restaurant || mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;