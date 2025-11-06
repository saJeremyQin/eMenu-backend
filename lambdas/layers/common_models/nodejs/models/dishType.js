import mongoose from "mongoose";

const DishTypeSchema = new mongoose.Schema({
  restaurantId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Restaurant', 
    required: true,  
  },
  name: { 
    type: String, 
    required: true,
    trim: true  // 自动去除首尾空格
  },
  alias: { 
    type: String,
    trim: true
  },
  sortOrder: { 
    type: Number,
    default: 0  // 默认值为 0
  },
  isDeleted: { 
    type: Boolean, 
    required: true,
    default: false  // 默认未删除
  },
  isActive: { 
    type: Boolean, 
    required: true,
    default: true  // 默认激活
  }
}, { 
  timestamps: true,  // 自动添加 createdAt 和 updatedAt
  toJSON: {
    virtuals: true,                   // 添加虚拟字段（id）
    versionKey: false,                // 去掉 __v 字段
    transform: (_, ret) => {
        ret.id = ret._id.toString();  // 映射 _id -> id
        delete ret._id;               // 删除 _id，避免重复
    }
  }
});

// 添加复合索引：按餐厅查询未删除的分类，并按 sortOrder 排序
DishTypeSchema.index({ restaurantId: 1, isDeleted: 1, sortOrder: 1 });

// 添加实例方法：软删除
DishTypeSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.isActive = false;  // 删除时也设为不激活
  return this.save();
};

// 添加实例方法：恢复
DishTypeSchema.methods.restore = function() {
  this.isDeleted = false;
  return this.save();
};

// 添加静态方法：获取餐厅的所有激活分类
DishTypeSchema.statics.findActiveByRestaurant = function(restaurantId) {
  return this.find({ 
    restaurantId, 
    isDeleted: false, 
    isActive: true 
  }).sort({ sortOrder: 1 });
};

const DishType = mongoose.models.DishType || mongoose.model('DishType', DishTypeSchema);
export default DishType;
