
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
        virtuals: true, // 启用虚拟属性
        transform: (doc, ret) => {
            ret.id = ret._id.toString(); // 将 _id 映射到 id
            delete ret._id;              // 移除原始的 _id 属性
            delete ret.__v;              // 移除 __v 属性 (Mongoose 版本控制)
        }
    }
});

const Restaurant = mongoose.models.Restaurant || mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;