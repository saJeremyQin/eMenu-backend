import mongoose from "mongoose";

const DishSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  dishTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'DishType', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, comment: 'by cents' }, // 单位分
  image: String,
  description: String,
  isAvailable: { type: Boolean, required: true },
  isDeleted: { type: Boolean, required: true }
}, { 
    timestamps: true,
    toJSON: {
    virtuals: true,                   // add virtual field（id）
    versionKey: false,                // 去掉 __v 字段
    transform: (_, ret) => {
        ret.id = ret._id.toString();  // 映射 _id -> id
        delete ret._id;               // delete _id，避免重复
    }
  }
});

const Dish = mongoose.models.Dish || mongoose.model('Dish', DishSchema);
export default Dish;