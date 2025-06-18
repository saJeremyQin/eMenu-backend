
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
    timestamps: true
});

const Restaurant = mongoose.moodels.Restaurant || mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;