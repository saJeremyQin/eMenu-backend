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
import Restaurant from '/opt/nodejs/models/restaurant.js';
import { getRestaurantIdFromIdentity, findUserForIdentity, requireRole } from '../utils/auth.js';
import { getTableLimit } from '../config/constants.js';
import { v4 as uuidv4 } from 'uuid';

// "07" and "7" are the same table, so table numbers are stored as plain integers in a string.
function normalizeTableNumber(rawTableNumber) {
  const value = String(rawTableNumber ?? '').trim();
  if (!/^\d+$/.test(value) || Number.parseInt(value, 10) < 1) {
    throw new Error('Invalid table number format. Table number must be a positive integer.');
  }
  return String(Number.parseInt(value, 10));
}

// The plan limits which tables can be OPENED. Orders already open on a table stay usable
// (e.g. after a downgrade from PRO to FREE), so this is only checked when a table opens.
async function assertTableAllowedByPlan(restaurantId, tableNumber) {
  const restaurant = await Restaurant.findById(restaurantId).select('subscriptionPlan');
  if (!restaurant) {
    throw new Error('Restaurant not found.');
  }
  const limit = getTableLimit(restaurant.subscriptionPlan);
  if (Number(tableNumber) > limit) {
    throw new Error(restaurant.subscriptionPlan === 'FREE'
      ? `Table ${tableNumber} isn't included in the FREE plan (tables 1-${limit}). Upgrade to PRO for unlimited tables.`
      : `Table numbers go up to ${limit}.`);
  }
}

// The signed-in boss or waiter of this restaurant. Tables are shared: every waiter of the
// restaurant can see and serve every order in it, so there is no per-waiter access check.
async function getCaller(identity, restaurantId) {
  const caller = await findUserForIdentity(identity);
  if (!caller || caller.isDeleted || String(caller.restaurantId) !== String(restaurantId)) {
    throw new Error('User not found.');
  }
  return caller;
}

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
  await getCaller(identity, restaurantId);
  
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
  const { tableNumber: rawTableNumber } = args;
  await getCaller(identity, restaurantId);
  
  try {
    const normalizedTableNumber = normalizeTableNumber(rawTableNumber);

    // 1. 查找该桌所有 PENDING 订单（排除 PAID 和 CANCELLED）
    const filter = {
      restaurantId,
      tableNumber: normalizedTableNumber,
      status: 'PENDING'
    };

    const activeOrders = await Order.find(filter).sort({ dinerId: 1, createdAt: 1 });
    
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
      tableNumber: normalizedTableNumber,
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
 * - Boss and waiters see all orders of their restaurant (tables are shared)
 * - 支持按状态、日期范围过滤
 */
export async function listOrders(args, identity) {
  console.log('Executing listOrders...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { status, dateFrom, dateTo } = args || {};
  await getCaller(identity, restaurantId);
  
  try {
    const filter = { restaurantId };
    
    if (status) {
      filter.status = status;
    }
    
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);  // ✅ 转为 Date 对象确保比较正确
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
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
  const waiter = await getCaller(identity, restaurantId);
  const input = args.input;
  
  const { tableNumber: rawTableNumber, dinerId = '0', tabId = 'tab-0', items } = input;
  // Waiters always confirm items directly. input.isFromCustomerScan is ignored so a
  // client cannot create unconfirmed (ORDERED) items; customer ordering (v2) will use
  // its own resolver that sets this server-side.
  const isFromCustomerScan = false;
  
  if (!rawTableNumber || !items || items.length === 0) {
    throw new Error('Table number and order items are required.');
  }
  
  try {
    const normalizedTableNumber = normalizeTableNumber(rawTableNumber);
    
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
        name: dish.name,
        price: dish.price,  // ✅ 安全：始终使用数据库中的价格，不信任客户端传入的价格
        quantity: item.quantity,
        notes: item.notes || null,
        status: isFromCustomerScan ? 'ORDERED' : 'CONFIRMED',
        confirmedAt: isFromCustomerScan ? null : new Date()
      };
      
      orderItems.push(orderItem);
    }
    
    // 2. 查找或创建订单（只查 PENDING 订单）
    let order = await Order.findOne({
      restaurantId,
      tableNumber: normalizedTableNumber,
      dinerId,
      tabId,
      status: 'PENDING'
    });

    let isNewOrder = false;
    
    if (order) {
      // Shared tables: whoever sends items to the kitchen now serves this order.
      order.waiterId = waiter._id;
    } else {
      // Opening a table (no open order on it yet) is limited by the plan.
      const tableIsOpen = await Order.exists({ restaurantId, tableNumber: normalizedTableNumber, status: 'PENDING' });
      if (!tableIsOpen) {
        await assertTableAllowedByPlan(restaurantId, normalizedTableNumber);
      }

      // ✅ 修复：检查同 tabId 下是否存在已取消订单
      // 场景：waiter 在同一桌台会话内取消订单后再次点单，
      // 若直接创建新 Order 会因唯一索引 (restaurantId,tableNumber,dinerId,tabId) 冲突报 E11000。
      const cancelledOrder = await Order.findOne({
        restaurantId,
        tableNumber: normalizedTableNumber,
        dinerId,
        tabId,
        status: 'CANCELLED'
      });

      if (cancelledOrder) {
        // 重新激活已取消订单：清空批次，重置金额，恢复 PENDING
        cancelledOrder.status = 'PENDING';
        cancelledOrder.batches = [];
        cancelledOrder.totalConfirmedAmount = 0;
        cancelledOrder.waiterId = waiter._id;
        order = cancelledOrder;
      } else {
        // 创建全新订单
        isNewOrder = true;
        order = new Order({
          restaurantId,
          waiterId: waiter._id,
          tableNumber: normalizedTableNumber,
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
    }
    
    // 3. 创建新batch（包含tabId和dinerId用于前端过滤）
    const batch = {
      batchId: uuidv4(),
      tabId: String(tabId),          // 确保是字符串
      dinerId: String(dinerId),      // 确保是字符串  
      items: orderItems,
      confirmedAt: new Date(),       // 使用 Date 对象而不是 ISO string
      confirmedBy: waiter._id,
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
  const caller = await getCaller(identity, restaurantId);
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
    if (order.status !== 'PENDING') {
      throw new Error('Only open orders can be paid.');
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
    order.paidAt = new Date();
    order.paidBy = caller._id;
    
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
  await getCaller(identity, restaurantId);
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
  await getCaller(identity, restaurantId);
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
        item.cancelledAt = new Date();  // ✅ 使用 Date 对象保持与 schema 类型一致
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
