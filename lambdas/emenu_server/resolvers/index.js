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
import * as restaurantResolvers from './restaurant.js';
import * as userResolvers from './user.js';
import * as waiterResolvers from './waiter.js';

// ====================================================================
// QUERY RESOLVERS
// ====================================================================
const Query = {
  // DishType queries
  listDishTypes: dishTypeResolvers.listDishTypes,
  // Dish queries
  listDishes: dishResolvers.listDishes,
  // Restaurant queries
  getRestaurant: restaurantResolvers.getRestaurant,
  // User queries
  getUser: userResolvers.getUser,
  getUserByCognito: userResolvers.getUserByCognito,
  // Waiter queries
  listWaiters: waiterResolvers.listWaiters,
  // 未来扩展：user, waiter, order queries
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
  // Restaurant mutations
  createRestaurant: restaurantResolvers.createRestaurant,
  updateRestaurantInfo: restaurantResolvers.updateRestaurantInfo,
  updateRestaurantSubscriptionPlan: restaurantResolvers.updateRestaurantSubscriptionPlan,
  // Waiter mutations
  inviteWaiter: waiterResolvers.inviteWaiter,
  registerWaiter: waiterResolvers.registerWaiter,
  deleteWaiter: waiterResolvers.deleteWaiter,
  // 未来扩展：user, waiter, order mutations
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
