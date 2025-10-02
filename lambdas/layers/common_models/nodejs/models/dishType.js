import mongoose from "mongoose";

const DishTypeSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  name: { type: String, required: true },
  alias: String,
  sortOrder: Number,
  isDeleted: { type: Boolean, required: true }
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

const DishType = mongoose.models.DishType || mongoose.model('DishType', DishTypeSchema);
export default DishType;
