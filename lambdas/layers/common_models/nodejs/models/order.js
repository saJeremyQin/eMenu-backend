import mongoose from "mongoose";

// OrderItem 子文档 schema（嵌入式）
const OrderItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true }, // 本批次内的唯一ID
  dishId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, comment: 'by cents' },
  quantity: { type: Number, required: true },
  notes: { type: String, default: '' },
  
  // 菜品状态（业务流程）
  status: {
    type: String,
    enum: ['ORDERED', 'CONFIRMED', 'CANCELLED'],
    default: 'CONFIRMED'
  },
  
  // 时间戳和追溯信息
  confirmedAt: { type: Date }, // 何时送厨（变为CONFIRMED时）
  cancelledAt: { type: Date }, // 何时退菜（变为CANCELLED时）
  cancelReason: { type: String } // 退菜原因（如'顾客要求'、'免单'等）
}, { _id: false });

// OrderBatch 子文档 schema（嵌入式）
const OrderBatchSchema = new mongoose.Schema({
  batchId: { type: String, required: true }, // 本批次的唯一ID
  tabId: { type: String, required: true }, // 该批次对应的diner tab (e.g. "tab-1-0")
  dinerId: { type: String, required: true }, // 该批次对应的diner ID (e.g. "0", "1", "2")
  items: [OrderItemSchema], // 该批次的菜品
  confirmedAt: { type: Date, required: true } // 这一批送厨的时间（仅作时间标记，无状态）
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  waiterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tableNumber: { type: String, required: true },
  
  // 订单分组标识
  dinerId: { type: String, required: true }, // "0" (主顾客) / "1"/"2"/"3"... (其他顾客编号)
  tabId: { type: String, required: true }, // "tab-0" / "tab-1" / "tab-2"... (对应dinerId)
  
  // 批次管理（v4核心）
  batches: [OrderBatchSchema], // 每次送厨是一个batch
  totalConfirmedAmount: { type: Number, required: true, default: 0, comment: 'all items sum in cents' },
  
  // 订单状态
  status: { type: String, enum: ['PENDING', 'PAID', 'CANCELLED'], default: 'PENDING' },
  
  // 支付信息
  paidAmount: { type: Number, default: 0, comment: 'by cents' },
  paidAt: { type: String }, // ISO timestamp
  
  // 扫码相关
  isFromCustomerScan: { type: Boolean, default: false },
  scannedAt: { type: String }, // ISO timestamp
  
  // 时间戳
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
    }
  }
});

// 自动更新 updatedAt
OrderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// 索引优化查询性能
OrderSchema.index({ restaurantId: 1, tableNumber: 1 });
OrderSchema.index({ restaurantId: 1, tableNumber: 1, dinerId: 1, tabId: 1 }, { unique: true });
OrderSchema.index({ restaurantId: 1, status: 1 });
OrderSchema.index({ createdAt: -1 });

const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);
export default Order;