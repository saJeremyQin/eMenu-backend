import mongoose from "mongoose";

const dishTypeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    alias: {
      type: String
    }
  },{
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

const DishType = mongoose.models.DishType || mongoose.model('DishType', dishTypeSchema);

export default DishType;
