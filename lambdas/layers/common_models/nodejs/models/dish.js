// Require the mongoose library
import mongoose from "mongoose";
import DishType from "./dishType.js";
import Restaurant from "./restaurant.js"

const dishSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true
        },
        description:{
            type: String,
        },
        price: {
            type: Number,
            required: true
        },
        image:{
            type: String
        },
        dishTypeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DishType',
            required: true
        },
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant',
            required: true
        }
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
    }
);

const Dish = mongoose.models.Dish || mongoose.model('Dish',dishSchema);

export default Dish;