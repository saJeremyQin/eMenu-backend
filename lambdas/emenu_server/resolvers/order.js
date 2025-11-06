/**
 * Order Resolvers
 * 订单的查询和操作（下单、结账、状态更新）
 */
import Order from '/opt/nodejs/models/order.js';
import OrderItem from '/opt/nodejs/models/orderItem.js';
import Dish from '/opt/nodejs/models/dish.js';
import User from '/opt/nodejs/models/user.js';
import { getRestaurantIdFromIdentity, getUserRole, requireRole } from '../utils/auth.js';

// ====================================================================
// QUERY RESOLVERS
// ====================================================================

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
      .populate('items')
      .sort({ createdAt: -1 });
    
    return orders.map(order => order.toJSON());
  } catch (err) {
    console.error(`Error fetching orders for restaurant ${restaurantId}:`, err);
    throw new Error(`Failed to fetch orders: ${err.message}`);
  }
}

// ====================================================================
// MUTATION RESOLVERS
// ====================================================================

/**
 * 下单（创建新订单）
 * - 仅 waiter 可以下单
 * - 验证菜品可用性和库存
 * - 计算订单总价
 */
export async function placeOrder(args, identity) {
  console.log('Executing placeOrder...');
  await requireRole(identity, ['waiter']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const cognitoId = identity.sub;
  const input = args.input;
  
  if (!input.tableNumber || !input.items || input.items.length === 0) {
    throw new Error('Table number and order items are required.');
  }
  
  try {
    const waiter = await User.findOne({ cognitoId });
    if (!waiter) {
      throw new Error('User not found.');
    }
    
    let totalAmount = 0;
    const orderItems = [];
    
    // 验证每个订单项目并计算总价
    for (const item of input.items) {
      if (!item.dishId || !item.quantity || item.quantity <= 0) {
        throw new Error('Invalid order item: dishId and positive quantity are required.');
      }
      
      const dish = await Dish.findOne({ 
        _id: item.dishId, 
        restaurantId, 
        isDeleted: { $ne: true },
        isAvailable: true
      });
      
      if (!dish) {
        throw new Error(`Dish not found or not available: ${item.dishId}`);
      }
      
      const orderItem = new OrderItem({
        dishId: item.dishId,
        name: dish.name,
        price: dish.price,
        quantity: item.quantity,
        notes: item.notes || null
      });
      
      const savedOrderItem = await orderItem.save();
      orderItems.push(savedOrderItem._id);
      totalAmount += dish.price * item.quantity;
    }
    
    // 创建订单
    const order = new Order({
      restaurantId,
      waiterId: waiter._id,
      tableNumber: input.tableNumber,
      status: 'PENDING',
      totalAmount,
      createdAt: new Date().toISOString(),
      items: orderItems
    });
    
    const savedOrder = await order.save();
    const orderObj = await Order.findById(savedOrder._id).populate('items');
    return orderObj.toJSON();
  } catch (err) {
    console.error(`Error placing order:`, err);
    throw new Error(`Failed to place order: ${err.message}`);
  }
}

/**
 * 结账（将订单状态改为已完成）
 * - 仅 boss 可以结账
 * - 订单必须是 PENDING 或 CONFIRMED 状态
 */
export async function checkoutOrder(args, identity) {
  console.log('Executing checkoutOrder...');
  await requireRole(identity, ['boss']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { orderId } = args;
  
  try {
    const order = await Order.findOne({ 
      _id: orderId, 
      restaurantId 
    }).populate('items');
    
    if (!order) {
      throw new Error('Order not found.');
    }
    
    if (order.status === 'COMPLETED') {
      throw new Error('Order is already completed.');
    }
    
    if (order.status === 'CANCELLED') {
      throw new Error('Cannot checkout a cancelled order.');
    }
    
    order.status = 'COMPLETED';
    const updatedOrder = await order.save();
    
    return updatedOrder.toJSON();
  } catch (err) {
    console.error(`Error checking out order ${orderId}:`, err);
    throw new Error(`Failed to checkout order: ${err.message}`);
  }
}

/**
 * 更新订单状态
 * - 仅 boss 可以更新订单状态
 * - 支持所有状态转换：PENDING, CONFIRMED, COMPLETED, CANCELLED
 */
export async function updateOrderStatus(args, identity) {
  console.log('Executing updateOrderStatus...');
  await requireRole(identity, ['boss']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { orderId, status } = args;
  
  if (!['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(status)) {
    throw new Error('Invalid order status.');
  }
  
  try {
    const order = await Order.findOne({ 
      _id: orderId, 
      restaurantId 
    }).populate('items');
    
    if (!order) {
      throw new Error('Order not found.');
    }
    
    order.status = status;
    const updatedOrder = await order.save();
    
    return updatedOrder.toJSON();
  } catch (err) {
    console.error(`Error updating order status ${orderId}:`, err);
    throw new Error(`Failed to update order status: ${err.message}`);
  }
}
