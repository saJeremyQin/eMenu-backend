import mongoose from "mongoose";

const DishSchema = new mongoose.Schema({
  restaurantId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Restaurant', 
    required: true,
  },
  dishTypeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'DishType', 
    required: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true  // 自动去除首尾空格
  },
  price: { 
    type: Number, 
    required: true,
    min: 0,  // 价格不能为负
    comment: 'Price in cents'  // 单位：分
  },
  imageUrl: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  sortOrder: { 
    type: Number,
    default: 0  // 默认值为 0
  },
  isAvailable: { 
    type: Boolean, 
    required: true,
    default: true  // 默认可售
  },
  isDeleted: { 
    type: Boolean, 
    required: true,
    default: false  // 默认未删除
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

// 添加复合索引：按餐厅和分类查询可售菜品，并按 sortOrder 排序
DishSchema.index({ restaurantId: 1, dishTypeId: 1, isDeleted: 1, sortOrder: 1 });

// 添加复合索引：按餐厅查询可售菜品
DishSchema.index({ restaurantId: 1, isDeleted: 1, isAvailable: 1 });

// 添加复合索引：按分类查询可售菜品，并按 sortOrder 排序
DishSchema.index({ dishTypeId: 1, isDeleted: 1, isAvailable: 1, sortOrder: 1 });

// 添加实例方法：软删除
DishSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.isAvailable = false;  // 删除时也设为不可售
  return this.save();
};

// 添加实例方法：恢复
DishSchema.methods.restore = function() {
  this.isDeleted = false;
  return this.save();
};

// 添加实例方法：切换可售状态
DishSchema.methods.toggleAvailability = function() {
  this.isAvailable = !this.isAvailable;
  return this.save();
};

// 添加静态方法：获取分类下的所有可售菜品
DishSchema.statics.findAvailableByDishType = function(dishTypeId) {
  return this.find({ 
    dishTypeId, 
    isDeleted: false, 
    isAvailable: true 
  }).sort({ sortOrder: 1 });
};

// 添加静态方法：获取餐厅的所有可售菜品
DishSchema.statics.findAvailableByRestaurant = function(restaurantId) {
  return this.find({ 
    restaurantId, 
    isDeleted: false, 
    isAvailable: true 
  }).sort({ dishTypeId: 1, sortOrder: 1 });
};

const Dish = mongoose.models.Dish || mongoose.model('Dish', DishSchema);
export default Dish;