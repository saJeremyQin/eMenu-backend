/**
 * 订阅限制检查工具
 * 验证餐厅是否超过当前订阅计划的限制
 */
import Restaurant from '/opt/nodejs/models/restaurant.js';
import DishType from '/opt/nodejs/models/dishType.js';
import Dish from '/opt/nodejs/models/dish.js';
import User from '/opt/nodejs/models/user.js';
import { SUBSCRIPTION_LIMITS } from '../config/constants.js';

/**
 * 检查菜品分类限额
 * @param {string} restaurantId - 餐厅 ID
 * @returns {Promise<{currentCount: number, limit: number, remaining: number}>}
 * @throws {Error} 如果超过限制
 */
export async function checkDishTypeLimit(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new Error('Restaurant not found');
  
  const currentCount = await DishType.countDocuments({ 
    restaurantId: restaurantId, 
    isDeleted: false 
  });
  
  const limit = SUBSCRIPTION_LIMITS[restaurant.subscriptionPlan].dishTypes;
  
  if (currentCount >= limit) {
    throw new Error(`You have reached the ${restaurant.subscriptionPlan} version dish type limit (${limit} items)`);
  }
  
  return { currentCount, limit, remaining: limit - currentCount };
}

/**
 * 检查菜品限额
 * @param {string} restaurantId - 餐厅 ID
 * @returns {Promise<{currentCount: number, limit: number, remaining: number}>}
 * @throws {Error} 如果超过限制
 */
export async function checkDishLimit(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new Error('Restaurant not found');
  
  const currentCount = await Dish.countDocuments({ 
    restaurantId: restaurantId, 
    isDeleted: false 
  });
  
  const limit = SUBSCRIPTION_LIMITS[restaurant.subscriptionPlan].dishes;
  
  if (currentCount >= limit) {
    throw new Error(`You have reached the ${restaurant.subscriptionPlan} version dish limit (${limit} items)`);
  }
  
  return { currentCount, limit, remaining: limit - currentCount };
}

/**
 * 检查服务员限额
 * @param {string} restaurantId - 餐厅 ID
 * @returns {Promise<{currentCount: number, limit: number, remaining: number}>}
 * @throws {Error} 如果超过限制
 */
export async function checkWaiterLimit(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new Error('Restaurant not found');
  
  const currentCount = await User.countDocuments({ 
    restaurantId: restaurantId, 
    role: 'waiter',
    isDeleted: false 
  });
  
  const limit = SUBSCRIPTION_LIMITS[restaurant.subscriptionPlan].waiters;
  
  if (currentCount >= limit) {
    throw new Error(`You have reached the ${restaurant.subscriptionPlan} version waiter limit (${limit} items)`);
  }
  
  return { currentCount, limit, remaining: limit - currentCount };
}
