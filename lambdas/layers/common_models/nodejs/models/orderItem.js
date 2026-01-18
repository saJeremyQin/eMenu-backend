import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema({
  dishId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, comment: 'by cents' }, // 单位分
  quantity: { type: Number, required: true },
  notes: String,
  
  // v4 新增字段
  status: { type: String, enum: ['DRAFT', 'PENDING_SCAN', 'CONFIRMED', 'CANCELLED', 'PAID'], default: 'DRAFT' },
  confirmedAt: { type: String }, // 确认时间
  cancelledAt: { type: String }, // 取消时间
  cancelReason: { type: String }, // 取消原因
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // 取消操作员ID
  paidAt: { type: String } // 支付时间
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

const OrderItem = mongoose.models.OrderItem || mongoose.model('OrderItem', OrderItemSchema);
export default OrderItem;