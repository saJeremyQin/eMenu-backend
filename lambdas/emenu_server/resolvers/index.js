/**
 * Resolvers Index
 * 聚合所有 resolver 模块，导出统一的 resolvers 对象
 * 
 * GraphQL Resolver 结构：
 * {
 *   Query: { ... },
 *   Mutation: { ... },
 *   TypeName: { fieldName: fieldResolver }
 * }
 */
import * as dishTypeResolvers from './dishType.js';
import * as dishResolvers from './dish.js';

// ====================================================================
// QUERY RESOLVERS
// ====================================================================
const Query = {
  // DishType queries
  listDishTypes: dishTypeResolvers.listDishTypes,
  
  // Dish queries
  listDishes: dishResolvers.listDishes,
  
  // 未来扩展：restaurant, user, waiter, order queries
  // 目前这些 resolver 仍在 index.mjs 中
};

// ====================================================================
// MUTATION RESOLVERS
// ====================================================================
const Mutation = {
  // DishType mutations
  createDishType: dishTypeResolvers.createDishType,
  updateDishType: dishTypeResolvers.updateDishType,
  deleteDishType: dishTypeResolvers.deleteDishType,
  
  // Dish mutations
  createDish: dishResolvers.createDish,
  updateDish: dishResolvers.updateDish,
  deleteDish: dishResolvers.deleteDish,
  updateDishAvailability: dishResolvers.updateDishAvailability,
  
  // 未来扩展：restaurant, user, waiter, order mutations
  // 目前这些 resolver 仍在 index.mjs 中
};

// ====================================================================
// FIELD RESOLVERS
// ====================================================================
const Dish = {
  // Dish.dishType field resolver
  dishType: dishResolvers.resolveDishType
};

// ====================================================================
// EXPORT COMBINED RESOLVERS
// ====================================================================
export const resolvers = {
  Query,
  Mutation,
  Dish
};
