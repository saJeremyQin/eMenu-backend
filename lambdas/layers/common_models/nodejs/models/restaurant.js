
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
      virtuals: true,                 // add virtual field（id）
      versionKey: false,              // remove __v field
      transform: (_, ret) => {
        ret.id = ret._id.toString();  // map _id -> id
        delete ret._id;               // 删除 _id，避免重复
      }
    }
});

const Restaurant = mongoose.models.Restaurant || mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;