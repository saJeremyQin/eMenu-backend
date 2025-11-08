/**
 * DishType Resolvers
 * 菜品分类的 CRUD 操作（Query 和 Mutation）
 */
import DishType from '/opt/nodejs/models/dishType.js';
import { getRestaurantIdFromIdentity, requireBoss } from '../utils/auth.js';
import { checkDishTypeLimit } from '../utils/subscription-limits.js';

// ====================================================================
// QUERY RESOLVERS
// ====================================================================

/**
 * 列出当前餐厅的所有菜品分类
 * - 只显示未删除的分类
 * - 按 sortOrder 排序
 */
export async function listDishTypes(args, identity) {
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  const dishTypes = await DishType.find({
    restaurantId,
    isDeleted: false
  }).sort({ sortOrder: 1 });
  
  return dishTypes;
}

// ====================================================================
// MUTATION RESOLVERS
// ====================================================================

/**
 * 创建新的菜品分类
 * - 仅 boss 可操作
 * - 检查订阅限制
 * - 自动设置 sortOrder（如果未提供）
 */
export async function createDishType(args, identity) {
  await requireBoss(identity);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  // 检查是否超过订阅限制
  await checkDishTypeLimit(restaurantId);
  
  const { name, alias, sortOrder, isActive } = args;
  
  // 如果没有提供 sortOrder，使用当前最大值 + 1
  let finalSortOrder = sortOrder;
  if (finalSortOrder === undefined || finalSortOrder === null) {
    const maxDishType = await DishType.findOne({ restaurantId, isDeleted: false })
      .sort({ sortOrder: -1 })
      .limit(1);
    finalSortOrder = maxDishType ? maxDishType.sortOrder + 1 : 0;
  }
  
  const dishType = new DishType({
    restaurantId,
    name,
    alias: alias || name, // 如果没有提供 alias，默认使用 name
    sortOrder: finalSortOrder,
    isActive: isActive !== undefined ? isActive : true, // 默认启用
    isDeleted: false
  });
  
  await dishType.save();
  return dishType;
}

/**
 * 更新菜品分类
 * - 仅 boss 可操作
 * - 仅允许修改 name, alias, sortOrder, isActive
 * - 不允许修改已删除的分类
 */
export async function updateDishType(args, identity) {
  await requireBoss(identity);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  const { id, name, alias, sortOrder, isActive } = args;
  
  const dishType = await DishType.findOne({
    _id: id,
    restaurantId,
    isDeleted: false
  });
  
  if (!dishType) {
    throw new Error('DishType not found or already deleted');
  }
  
  // 更新允许的字段
  if (name !== undefined) dishType.name = name;
  if (alias !== undefined) dishType.alias = alias;
  if (sortOrder !== undefined) dishType.sortOrder = sortOrder;
  if (isActive !== undefined) dishType.isActive = isActive;
  
  await dishType.save();
  return dishType;
}

/**
 * 删除菜品分类（软删除）
 * - 仅 boss 可操作
 * - 使用 softDelete() 方法：设置 isDeleted=true, isActive=false
 * - 注意：不会删除该分类下的菜品（需要前端确认或单独处理）
 */
export async function deleteDishType(args, identity) {
  await requireBoss(identity);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  const { id } = args;
  
  // Soft delete and return document after update (return Document so schema.toJSON runs)
  const dishType = await DishType.findOneAndUpdate(
    { _id: id, restaurantId, isDeleted: false },
    { isDeleted: true, isActive: false, updatedAt: new Date() },
    { new: true }
  );

  if (!dishType) {
    throw new Error('DishType not found or already deleted');
  }
  return dishType;
}

// lambdas/emenu_server/resolvers/dishType.js
export async function toggleDishTypeStatus(args, identity) {
  await requireBoss(identity);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  const { id, isActive } = args;
  
  const dishType = await DishType.findOneAndUpdate(
    { _id: id, restaurantId, isDeleted: false },
    { isActive, updatedAt: new Date() },
    { new: true }
  );
  
  if (!dishType) throw new Error('DishType not found');
  
  return dishType;
}