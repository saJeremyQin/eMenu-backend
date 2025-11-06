/**
 * Dish Resolvers
 * 菜品的 CRUD 操作和 Field Resolver
 */
import Dish from '/opt/nodejs/models/dish.js';
import DishType from '/opt/nodejs/models/dishType.js';
import { getRestaurantIdFromIdentity, requireBoss } from '../utils/auth.js';
import { checkDishLimit } from '../utils/subscription-limits.js';

// ====================================================================
// QUERY RESOLVERS
// ====================================================================

/**
 * 列出菜品
 * - 可选：通过 dishTypeId 过滤
 * - 按 dishTypeId + sortOrder 排序（同一分类内按顺序显示）
 * - 只显示未删除的菜品
 */
export async function listDishes(args, identity) {
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { dishTypeId } = args;
  
  const filter = {
    restaurantId,
    isDeleted: false
  };
  
  // 如果提供了 dishTypeId，只查询该分类下的菜品
  if (dishTypeId) {
    filter.dishTypeId = dishTypeId;
  }
  
  const dishes = await Dish.find(filter)
    .sort({ dishTypeId: 1, sortOrder: 1 });
  
  return dishes;
}

// ====================================================================
// MUTATION RESOLVERS
// ====================================================================

/**
 * 创建新菜品
 * - 仅 boss 可操作
 * - 检查订阅限制
 * - 验证 dishTypeId 存在且属于当前餐厅
 * - 自动设置 sortOrder（如果未提供）
 */
export async function createDish(args, identity) {
  await requireBoss(identity);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  // 检查是否超过订阅限制
  await checkDishLimit(restaurantId);
  
  const { dishTypeId, name, price, description, image, sortOrder, isAvailable } = args;
  
  // 验证 dishTypeId 存在且属于当前餐厅
  const dishType = await DishType.findOne({
    _id: dishTypeId,
    restaurantId,
    isDeleted: false
  });
  
  if (!dishType) {
    throw new Error('DishType not found or does not belong to your restaurant');
  }
  
  // 如果没有提供 sortOrder，在该分类下使用最大值 + 1
  let finalSortOrder = sortOrder;
  if (finalSortOrder === undefined || finalSortOrder === null) {
    const maxDish = await Dish.findOne({ 
      restaurantId, 
      dishTypeId,
      isDeleted: false 
    })
      .sort({ sortOrder: -1 })
      .limit(1);
    finalSortOrder = maxDish ? maxDish.sortOrder + 1 : 0;
  }
  
  const dish = new Dish({
    restaurantId,
    dishTypeId,
    name,
    price,
    description: description || '',
    image: image || '',
    sortOrder: finalSortOrder,
    isAvailable: isAvailable !== undefined ? isAvailable : true, // 默认上架
    isDeleted: false
  });
  
  await dish.save();
  return dish;
}

/**
 * 更新菜品
 * - 仅 boss 可操作
 * - 允许修改：name, price, description, image, sortOrder
 * - 不允许修改已删除的菜品
 * - 注意：不允许修改 dishTypeId（如需要，应先删除再创建）
 */
export async function updateDish(args, identity) {
  await requireBoss(identity);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  const { id, name, price, description, image, sortOrder } = args;
  
  const dish = await Dish.findOne({
    _id: id,
    restaurantId,
    isDeleted: false
  });
  
  if (!dish) {
    throw new Error('Dish not found or already deleted');
  }
  
  // 更新允许的字段
  if (name !== undefined) dish.name = name;
  if (price !== undefined) dish.price = price;
  if (description !== undefined) dish.description = description;
  if (image !== undefined) dish.image = image;
  if (sortOrder !== undefined) dish.sortOrder = sortOrder;
  
  await dish.save();
  return dish;
}

/**
 * 删除菜品（软删除）
 * - 仅 boss 可操作
 * - 使用 softDelete() 方法：设置 isDeleted=true, isAvailable=false
 */
export async function deleteDish(args, identity) {
  await requireBoss(identity);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  const { id } = args;
  
  const dish = await Dish.findOne({
    _id: id,
    restaurantId,
    isDeleted: false
  });
  
  if (!dish) {
    throw new Error('Dish not found or already deleted');
  }
  
  // 使用模型的 softDelete 实例方法
  await dish.softDelete();
  
  return {
    success: true,
    message: 'Dish deleted successfully'
  };
}

/**
 * 更新菜品上架状态
 * - 仅 boss 可操作
 * - 快捷方式：切换 isAvailable 状态（上架/下架）
 */
export async function updateDishAvailability(args, identity) {
  await requireBoss(identity);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  const { id, isAvailable } = args;
  
  const dish = await Dish.findOne({
    _id: id,
    restaurantId,
    isDeleted: false
  });
  
  if (!dish) {
    throw new Error('Dish not found or already deleted');
  }
  
  dish.isAvailable = isAvailable;
  await dish.save();
  
  return dish;
}

// ====================================================================
// FIELD RESOLVERS
// ====================================================================

/**
 * Dish.dishType Field Resolver
 * - 从 dishTypeId 填充完整的 DishType 对象
 * - 验证 restaurantId 匹配，防止跨餐厅数据泄露
 * - 排除已删除的 DishType
 * - 如果找不到有效的 DishType，抛出错误（因为 schema 定义为非空）
 */
export async function resolveDishType(parent) {
  // parent 是 Dish 对象，包含 dishTypeId 和 restaurantId
  const dishType = await DishType.findOne({
    _id: parent.dishTypeId,
    restaurantId: parent.restaurantId, // 必须属于同一餐厅
    isDeleted: false                   // 排除已软删除的分类
  });
  
  if (!dishType) {
    console.error(`CRITICAL: DishType not found for Dish ${parent._id}: dishTypeId=${parent.dishTypeId}, restaurantId=${parent.restaurantId}`);
    throw new Error(`Invalid dish category: Dish "${parent.name}" (${parent._id}) references a non-existent or deleted DishType. Please fix data inconsistency.`);
  }
  
  return dishType;
}
