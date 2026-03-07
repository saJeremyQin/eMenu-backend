/**
 * Order Resolvers
 * 批次管理版本，支持多次送厨、分餐管理的订单系统
 * 
 * 核心概念：
 * - Order：一个顾客在一张桌的订单（整桌or分餐都是一个Order）
 * - Batch：每次送厨形成一个batch（支持多次加菜）
 * - dinerId："0"=主顾客，"1"/"2"...=其他顾客（分餐编号）
 * - tabId："tab-0"/"tab-1"...（对应dinerId）
 */
import Order from '/opt/nodejs/models/order.js';
import Dish from '/opt/nodejs/models/dish.js';
import User from '/opt/nodejs/models/user.js';
import { getRestaurantIdFromIdentity, getUserRole, requireRole } from '../utils/auth.js';
import { v4 as uuidv4 } from 'uuid';

// ====================================================================
// QUERY RESOLVERS
// ====================================================================

/**
 * 获取订单详情
 */
export async function getOrder(args, identity) {
  console.log('Executing getOrder...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { id } = args;
  
  try {
    const order = await Order.findOne({ 
      _id: id, 
      restaurantId 
    });
    
    if (!order) {
      throw new Error('Order not found.');
    }
    
    return order.toJSON();
  } catch (err) {
    console.error('Error fetching order:', err);
    throw new Error(`Failed to fetch order: ${err.message}`);
  }
}

/**
 * 获取桌台状态
 * - 返回该桌的所有未支付订单（按diner分组）
 * - 计算整桌已送厨的总金额
 * - 返回各diner的明细
 */
export async function getTableStatus(args, identity) {
  console.log('Executing getTableStatus...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { tableNumber } = args;
  
  try {
    // 1. 查找该桌的所有未支付订单
    const activeOrders = await Order.find({
      restaurantId,
      tableNumber,
      status: { $ne: 'PAID' }  // 未支付的订单
    }).sort({ dinerId: 1, createdAt: 1 });
    
    // 2. 计算整桌总金额
    const totalConfirmedAmount = activeOrders.reduce((sum, order) => {
      return sum + (order.totalConfirmedAmount || 0);
    }, 0);
    
    // 3. 构建diner信息
    const diners = activeOrders.map(order => ({
      dinerId: order.dinerId,
      tabId: order.tabId,
      confirmedAmount: order.totalConfirmedAmount || 0,
      batches: order.batches || []
    }));
    
    return {
      tableNumber,
      activeOrders: activeOrders.map(o => o.toJSON()),
      totalConfirmedAmount,
      diners
    };
  } catch (err) {
    console.error('Error fetching table status:', err);
    throw new Error(`Failed to fetch table status: ${err.message}`);
  }
}

/**
 * 查询订单列表
 * - Boss 可以查看餐厅所有订单
 * - Waiter 只能查看自己创建的订单
 * - 支持按状态、日期范围过滤
 */
export async function listOrders(args, identity) {
  console.log('Executing listOrders...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { status, dateFrom, dateTo } = args || {};
  const role = await getUserRole(identity);
  const caller = await User.findOne({ cognitoId: identity.sub });
  
  try {
    const filter = { restaurantId };
    
    // Waiter 只能看自己的订单
    if (role === 'waiter' && caller) {
      filter.waiterId = caller._id;
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = dateFrom;
      if (dateTo) filter.createdAt.$lte = dateTo;
    }
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 });
    
    return orders.map(order => order.toJSON());
  } catch (err) {
    console.error('Error fetching orders:', err);
    throw new Error(`Failed to fetch orders: ${err.message}`);
  }
}


// ====================================================================
// MUTATION RESOLVERS
// ====================================================================

/**
 * 送厨核心操作（confirmOrderItems）
 * - 为waiter代客点单的场景：直接创建batch，item状态为CONFIRMED
 * - 为顾客自己点单的场景：item状态先为ORDERED，waiter确认后变为CONFIRMED
 * 
 * 根据 (tableNumber, dinerId, tabId) 查找已有订单
 *   - 存在 → 添加新batch
 *   - 不存在 → 创建新Order并添加第一个batch
 */
export async function confirmOrderItems(args, identity) {
  console.log('Executing confirmOrderItems...');
  await requireRole(identity, ['waiter']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const cognitoId = identity.sub;
  const input = args.input;
  
  const { tableNumber, dinerId = '0', tabId = 'tab-0', items, isFromCustomerScan = false } = input;
  
  if (!tableNumber || !items || items.length === 0) {
    throw new Error('Table number and order items are required.');
  }
  
  try {
    const waiter = await User.findOne({ cognitoId });
    if (!waiter) {
      throw new Error('User not found.');
    }
    
    // 1. 验证菜品并构建OrderItem
    const orderItems = [];
    
    for (const item of input.items) {
      if (!item.dishId || !item.quantity || item.quantity <= 0) {
        throw new Error('Invalid order item: dishId and positive quantity are required.');
      }
      
      // 验证菜品
      const dish = await Dish.findOne({ 
        _id: item.dishId, 
        restaurantId, 
        isDeleted: { $ne: true },
        isActive: true
      });
      
      if (!dish) {
        throw new Error(`Dish not found or not available: ${item.dishId}`);
      }
      
      // 创建OrderItem（嵌入到batch中）
      const orderItem = {
        itemId: uuidv4(),
        dishId: item.dishId.toString(),
        name: item.name || dish.name,
        price: item.price || dish.price,
        quantity: item.quantity,
        notes: item.notes || null,
        // 直接设置为CONFIRMED（waiter送厨时）
        // 如果是顾客自己点单来的，在createOrderFromCustomerScan中会先设为ORDERED
        status: isFromCustomerScan ? 'ORDERED' : 'CONFIRMED',
        confirmedAt: isFromCustomerScan ? null : new Date().toISOString()
      };
      
      orderItems.push(orderItem);
    }
    
    // 2. 查找或创建订单
    let order = await Order.findOne({
      restaurantId,
      tableNumber,
      dinerId,
      tabId,
      status: { $ne: 'CANCELLED' }
    });
    
    let isNewOrder = false;
    
    if (!order) {
      // 创建新订单
      isNewOrder = true;
      order = new Order({
        restaurantId,
        waiterId: waiter._id,
        tableNumber,
        dinerId,
        tabId,
        status: 'PENDING',
        totalConfirmedAmount: 0,
        batches: [],
        isFromCustomerScan,
        scannedAt: isFromCustomerScan ? new Date().toISOString() : null,
        paidAmount: 0
      });
    }
    
    // 3. 创建新batch（包含tabId和dinerId用于前端过滤）
    const batch = {
      batchId: uuidv4(),
      tabId: String(tabId),          // 确保是字符串
      dinerId: String(dinerId),      // 确保是字符串  
      items: orderItems,
      confirmedAt: new Date(),       // 使用 Date 对象而不是 ISO string
    };
    
    console.log('🔧 Creating batch with fields:', {
      batchId: batch.batchId,
      tabId: batch.tabId,
      tabIdType: typeof batch.tabId,
      dinerId: batch.dinerId,
      dinerIdType: typeof batch.dinerId,
      itemsCount: batch.items.length,
    });
    
    // 4. 添加batch到订单
    if (!order.batches) {
      order.batches = [];
    }
    order.batches.push(batch);
    
    // 5. 更新totalConfirmedAmount（只算CONFIRMED且未CANCELLED的菜）
    order.totalConfirmedAmount = order.batches.reduce((sum, b) => {
      return sum + b.items
        .filter(item => item.status === 'CONFIRMED' && !item.cancelledAt)
        .reduce((s, item) => s + (item.price * item.quantity), 0);
    }, 0);
    
    // 6. 保存订单
    const savedOrder = await order.save();
    
    console.log(`Order ${isNewOrder ? 'created' : 'updated'}: ${savedOrder._id}, dinerId=${dinerId}, tabId=${tabId}, batches=${savedOrder.batches.length}`);
    
    // 🔧 DEBUG: 验证保存后的数据结构
    console.log('🔧 confirmOrderItems - savedOrder object:', savedOrder);
    console.log('🔧 confirmOrderItems - savedOrder.batches:', savedOrder.batches);
    const jsonOrder = savedOrder.toJSON();
    console.log('🔧 confirmOrderItems - After toJSON():', jsonOrder);
    console.log('🔧 confirmOrderItems - JSON keys:', jsonOrder ? Object.keys(jsonOrder) : 'NULL');
    
    // 7. 发送webhook给厨房（KDS系统）
    // TODO: await notifyKitchen(savedOrder, batch);
    
    return jsonOrder;
  } catch (err) {
    console.error('Error confirming order items:', err);
    throw new Error(`Failed to confirm order items: ${err.message}`);
  }
}

/**
 * 支付订单
 * - 全额支付整个Order
 * - 计算当前CONFIRMED且未CANCELLED的所有菜的总价
 * - 标记Order.status = PAID
 */
export async function payOrder(args, identity) {
  console.log('Executing payOrder...');
  await requireRole(identity, ['boss', 'waiter']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { orderId } = args;
  
  try {
    const order = await Order.findOne({ 
      _id: orderId, 
      restaurantId 
    });
    
    if (!order) {
      throw new Error('Order not found.');
    }
    
    if (order.status === 'PAID') {
      throw new Error('Order is already paid.');
    }
    
    // 计算应付金额（只算CONFIRMED且未CANCELLED的菜）
    const totalAmount = order.batches.reduce((sum, batch) => {
      return sum + batch.items
        .filter(item => item.status === 'CONFIRMED' && !item.cancelledAt)
        .reduce((s, item) => s + (item.price * item.quantity), 0);
    }, 0);
    
    if (totalAmount <= 0) {
      throw new Error('No items to pay for.');
    }
    
    // 标记订单为已支付
    order.status = 'PAID';
    order.paidAmount = totalAmount;
    order.paidAt = new Date().toISOString();
    
    const updatedOrder = await order.save();
    
    console.log(`Order ${orderId} paid. Amount: ${totalAmount} cents`);
    
    return updatedOrder.toJSON();
  } catch (err) {
    console.error('Error paying order:', err);
    throw new Error(`Failed to pay order: ${err.message}`);
  }
}

/**
 * 取消订单
 * - 标记整个订单为已取消
 * - 不允许已支付的订单被取消
 */
export async function cancelOrder(args, identity) {
  console.log('Executing cancelOrder...');
  await requireRole(identity, ['boss', 'waiter']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { orderId } = args;
  
  try {
    const order = await Order.findOne({ 
      _id: orderId, 
      restaurantId 
    });
    
    if (!order) {
      throw new Error('Order not found.');
    }
    
    if (order.status === 'PAID') {
      throw new Error('Cannot cancel a paid order.');
    }
    
    order.status = 'CANCELLED';
    const updatedOrder = await order.save();
    
    console.log(`Order ${orderId} cancelled.`);
    
    return updatedOrder.toJSON();
  } catch (err) {
    console.error('Error cancelling order:', err);
    throw new Error(`Failed to cancel order: ${err.message}`);
  }
}

/**
 * 取消订单中的单个菜品（退菜）
 * - 标记item.status = CANCELLED
 * - 记录cancelledAt和cancelReason
 * - 如果该batch内所有item都被取消，删除该batch
 * - 重新计算totalConfirmedAmount
 */
export async function cancelOrderItem(args, identity) {
  console.log('Executing cancelOrderItem...');
  await requireRole(identity, ['boss', 'waiter']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { orderId, itemId, reason } = args;
  
  try {
    const order = await Order.findOne({ 
      _id: orderId, 
      restaurantId 
    });
    
    if (!order) {
      throw new Error('Order not found.');
    }
    
    if (order.status === 'PAID') {
      throw new Error('Cannot cancel item from a paid order.');
    }
    
    // 1. 查找item并标记为CANCELLED
    let itemFound = false;
    
    for (const batch of order.batches) {
      const item = batch.items.find(i => i.itemId === itemId);
      if (item) {
        itemFound = true;
        if (item.status === 'CANCELLED') {
          throw new Error('Item is already cancelled.');
        }
        item.status = 'CANCELLED';
        item.cancelledAt = new Date().toISOString();
        item.cancelReason = reason || 'No reason provided';
        break;
      }
    }
    
    if (!itemFound) {
      throw new Error('Item not found in this order.');
    }
    
    // 2. 清理空batch（所有item都被取消的batch）
    order.batches = order.batches.filter(batch => {
      const hasUnCancelledItem = batch.items.some(item => item.status !== 'CANCELLED');
      return hasUnCancelledItem;
    });
    
    // 3. 重新计算totalConfirmedAmount
    order.totalConfirmedAmount = order.batches.reduce((sum, batch) => {
      return sum + batch.items
        .filter(item => item.status === 'CONFIRMED' && !item.cancelledAt)
        .reduce((s, item) => s + (item.price * item.quantity), 0);
    }, 0);
    
    // 4. 如果没有batch了，标记订单为已取消
    if (order.batches.length === 0) {
      order.status = 'CANCELLED';
    }
    
    const updatedOrder = await order.save();
    
    console.log(`Item ${itemId} cancelled from order ${orderId}. Reason: ${reason || 'N/A'}`);
    
    return updatedOrder.toJSON();
  } catch (err) {
    console.error('Error cancelling order item:', err);
    throw new Error(`Failed to cancel order item: ${err.message}`);
  }
}
