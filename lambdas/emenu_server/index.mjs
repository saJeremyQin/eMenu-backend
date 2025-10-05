import mongoose from "mongoose";
import Restaurant from '/opt/nodejs/models/restaurant.js';
import User from '/opt/nodejs/models/user.js';
import Dish from '/opt/nodejs/models/dish.js';
import DishType from '/opt/nodejs/models/dishType.js';
import Order from '/opt/nodejs/models/order.js';
import OrderItem from '/opt/nodejs/models/orderItem.js';
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

// ====================================================================
// SUBSCRIPTION PLAN LIMITS CONSTANTS
// ====================================================================
const SUBSCRIPTION_LIMITS = {
  BASIC: {
    restaurants: 1,
    dishTypes: 2,
    dishes: 10,
    waiters: 2
  },
  PREMIUM: {
    restaurants: 1,
    dishTypes: 20,
    dishes: 200,
    waiters: 20
  }
};

let cachedDbUri = null;

const connectDb = async () => {
  if (mongoose.connection.readyState !== 0) {
    console.log("🔗 MongoDB already connected.");
    return;
  }

  if (!cachedDbUri) {
    const ssmClient = new SSMClient({ region: "ap-southeast-2" });
    const paramName = process.env.DB_PARAM_NAME;

    if (!paramName) {
      throw new Error("DB_PARAM_NAME is not set in environment variables.");
    }

    try {
      console.log("🔍 Retrieving MongoDB URI from SSM...");
      const command = new GetParameterCommand({
        Name: paramName,
        WithDecryption: true
      });

      const response = await ssmClient.send(command);
      cachedDbUri = response.Parameter?.Value;
      console.log('The cachedDbUri is %s', cachedDbUri);

      console.log("✅ Successfully retrieved DB URI from SSM.");
    } catch (error) {
      console.error("❌ Failed to retrieve DB URI from SSM:", error);
      throw new Error("Failed to retrieve DB URI from SSM");
    }
  }

  try {
    console.log("🌐 Attempting to connect to MongoDB...");
    await mongoose.connect(cachedDbUri);
    console.log("✅ MongoDB connected successfully!");
  } catch (dbError) {
    console.error("❌ MongoDB connection failed:", dbError);
    throw new Error(`Database connection failed: ${dbError.message}`);
  }
};

// Helper: get restaurantId from identity (by cognitoId)
async function getRestaurantIdFromIdentity(identity) {
  const cognitoId = identity?.sub || identity?.claims?.sub;
  console.log("DEBUG: cognitoId is", cognitoId);
  if (!cognitoId) throw new Error("Cognito identity sub not found.");

  const user = await User.findOne({ cognitoId });
  if (!user) {
    const count = await User.countDocuments();
    const allUsers = await User.find().limit(5);
    console.error("DEBUG: First 5 users in DB:", allUsers);
    throw new Error("User not found.");
  }
  if (!user.restaurantId) throw new Error("User is not associated with a restaurant.");
  return user.restaurantId;
}

// ====================================================================
// SUBSCRIPTION LIMIT HELPER FUNCTIONS
// ====================================================================

// 检查菜品分类限额
async function checkDishTypeLimit(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new Error('Restaurant not found');
  
  const currentCount = await DishType.countDocuments({ 
    restaurantId: restaurantId, 
    isDeleted: false 
  });
  
  const limit = SUBSCRIPTION_LIMITS[restaurant.subscriptionPlan].dishTypes;
  
  if (currentCount >= limit) {
    throw new Error(`已达到${restaurant.subscriptionPlan}版本菜品分类数量限制（${limit}个）`);
  }
  
  return { currentCount, limit, remaining: limit - currentCount };
}

// 检查菜品限额
async function checkDishLimit(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new Error('Restaurant not found');
  
  const currentCount = await Dish.countDocuments({ 
    restaurantId: restaurantId, 
    isDeleted: false 
  });
  
  const limit = SUBSCRIPTION_LIMITS[restaurant.subscriptionPlan].dishes;
  
  if (currentCount >= limit) {
    throw new Error(`已达到${restaurant.subscriptionPlan}版本菜品数量限制（${limit}个）`);
  }
  
  return { currentCount, limit, remaining: limit - currentCount };
}

// 检查服务员限额
async function checkWaiterLimit(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new Error('Restaurant not found');
  
  const currentCount = await User.countDocuments({ 
    restaurantId: restaurantId, 
    role: 'waiter',
    isDeleted: false 
  });
  
  const limit = SUBSCRIPTION_LIMITS[restaurant.subscriptionPlan].waiters;
  
  if (currentCount >= limit) {
    throw new Error(`已达到${restaurant.subscriptionPlan}版本服务员数量限制（${limit}个）`);
  }
  
  return { currentCount, limit, remaining: limit - currentCount };
}

// Handler入口
export const handler = async (event, context) => {
  try {
    console.log('Received AppSync event:', JSON.stringify(event, null, 2));

    await connectDb();

    const field = event.fieldName;
    const identity = event.identity;

    if (!identity || !identity.sub) {
      console.error('Auth Check: No identity found or missing sub in AppSync event context.');
      throw new Error('Authentication required.');
    }
    console.log('Auth Check: Identity object from AppSync:', JSON.stringify(identity, null, 2));
    console.log('Auth Check: User ID (sub):', identity.sub);

    switch (field) {
      case "getUser":
        return await getUser(event.arguments, identity);
      case "getRestaurant":
        return await getRestaurant(event.arguments, identity);
      case "listDishTypes":
        return await listDishTypes(event, identity);
      case "listDishes":
        return await listDishes(event, context);
      case "listOrders":
        return await listOrders(event, identity);
      case "createRestaurant":
        return await createRestaurant(event.arguments, identity);
      case "updateRestaurantInfo":
        return await updateRestaurantInfo(event.arguments, identity);
      case "updateRestaurantSubscriptionPlan":
        return await updateRestaurantSubscriptionPlan(event.arguments, identity);
      case "inviteWaiter":
        return await inviteWaiter(event.arguments, identity);
      case "createDishType":
        return await createDishType(event.arguments, identity);
      case "updateDishType":
        return await updateDishType(event.arguments, identity);
      case "deleteDishType":
        return await deleteDishType(event.arguments, identity);
      case "createDish":
        return await createDish(event.arguments, identity);
      case "updateDish":
        return await updateDish(event.arguments, identity);
      case "deleteDish":
        return await deleteDish(event.arguments, identity);
      case "updateDishAvailability":
        return await updateDishAvailability(event.arguments, identity);
      case "placeOrder":
        return await placeOrder(event.arguments, identity);
      case "checkoutOrder":
        return await checkoutOrder(event.arguments, identity);
      case "updateOrderStatus":
        return await updateOrderStatus(event.arguments, identity);
      default:
        console.error(`Unknown field: ${field}`);
        throw new Error(`Unknown field: ${field}`);
    }

  } catch (error) {
    console.error("❌ Lambda execution failed:", error);
    throw error;
  }
};

// ====================================================================
// QUERY RESOLVERS
// ====================================================================

// getUser 查询（按 cognitoId 查找，兼容 admin 权限）
const getUser = async (args, identity) => {
  console.log('Executing getUser...');
  const requestedCognitoId = args.id; // GraphQL query的id参数
  const callerCognitoId = identity.sub;
  const callerGroups = identity.claims && identity.claims['cognito:groups'] ? identity.claims['cognito:groups'] : [];

  console.log(`getUser request: Caller cognitoId: ${callerCognitoId}, Requested cognitoId: ${requestedCognitoId}`);
  console.log(`Caller Groups: ${callerGroups.join(', ')}`);

  if (callerGroups.includes("admin")) {
    console.log(`Authorization: Caller ${callerCognitoId} is an admin. Allowing query for ${requestedCognitoId}.`);
  } else if (requestedCognitoId === callerCognitoId) {
    console.log(`Authorization: Caller ${callerCognitoId} is querying their own user data. Allowing.`);
  } else {
    console.error(`Authorization: Caller ${callerCognitoId} is not authorized to query user ${requestedCognitoId}.`);
    throw new Error("Unauthorized: You are not authorized to access this user's information.");
  }

  try {
    const user = await User.findOne({ cognitoId: requestedCognitoId });
    if (!user) {
      console.error(`User with cognitoId ${requestedCognitoId} not found.`);
      return null;
    }
   return {
      id: user._id ? user._id.toString() : user.cognitoId,
      cognitoId: user.cognitoId,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId ? user.restaurantId.toString() : null,
      isDeleted: !!user.isDeleted,
    };
  } catch (err) {
    console.error(`Error fetching user ${requestedCognitoId}:`, err);
    throw new Error(`Failed to fetch user: ${err.message}`);
  }
};

// getRestaurant 查询（获取当前用户所属的餐厅信息）
const getRestaurant = async (args, identity) => {
  console.log('Executing getRestaurant...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  try {
    const restaurant = await Restaurant.findById(restaurantId).populate('waiters');
    if (!restaurant) {
      console.error(`Restaurant with id ${restaurantId} not found.`);
      return null;
    }
    
    const restaurantObj = restaurant.toJSON();
    // 确保 waiters 字段正确映射
    if (restaurantObj.waiters) {
      restaurantObj.waiters = restaurantObj.waiters.map(waiter => ({
        id: waiter._id ? waiter._id.toString() : waiter.id,
        cognitoId: waiter.cognitoId,
        email: waiter.email,
        role: waiter.role,
        restaurantId: waiter.restaurantId ? waiter.restaurantId.toString() : null,
        isDeleted: !!waiter.isDeleted,
      }));
    }
    
    return restaurantObj;
  } catch (err) {
    console.error(`Error fetching restaurant ${restaurantId}:`, err);
    throw new Error(`Failed to fetch restaurant: ${err.message}`);
  }
};

// listDishTypes 查询
const listDishTypes = async (event, identity) => {
  console.log('Executing listDishTypes...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  
  try {
    const dishTypes = await DishType.find({ 
      restaurantId, 
      isDeleted: { $ne: true } 
    }).sort({ sortOrder: 1, name: 1 });
    
    return dishTypes.map(dt => dt.toJSON());
  } catch (err) {
    console.error(`Error fetching dish types for restaurant ${restaurantId}:`, err);
    throw new Error(`Failed to fetch dish types: ${err.message}`);
  }
};

// listDishes 查询，支持 dishTypeId 过滤、自动 populate dishTypeId 字段
const listDishes = async (event, context) => {
  console.info("Executing listDishes...");
  const identity = event.identity;
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  console.log('restaurantId is %s', restaurantId);

  // 支持 dishTypeId 过滤
  const { dishTypeId } = event.arguments || {};
  console.log('dishTypeId inside is %s', dishTypeId);

  const filter = { restaurantId, isDeleted: { $ne: true } };
  if (dishTypeId) filter.dishTypeId = dishTypeId;

  // 用 populate 得到 dishType 详情
  const dishes = await Dish.find(filter).populate('dishTypeId');

  return dishes.map(d => {
    const dishObj = d.toJSON();
    dishObj.dishType = dishObj.dishTypeId;
    return dishObj;
  });
};

// listOrders 查询
const listOrders = async (event, identity) => {
  console.log('Executing listOrders...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { status, dateFrom, dateTo } = event.arguments || {};
  
  try {
    const filter = { restaurantId };
    
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
};

// ====================================================================
// MUTATION RESOLVERS
// ====================================================================

// 创建餐厅 - 固定为 BASIC 版本
const createRestaurant = async (args, identity) => {
  console.log('Executing createRestaurant...');
  const cognitoId = identity.sub;
  const groups = identity.claims && identity.claims['cognito:groups'] ? identity.claims['cognito:groups'] : [];
  if (!groups.includes("boss")) {
    console.error('Auth Check (in createRestaurant): User not in "boss" group. Groups:', groups);
    throw new Error("Only boss users can create restaurants");
  }

  try {
    // 防止重复创建
    const existing = await Restaurant.findOne({ bossId: cognitoId });
    if (existing) {
      const existingObject = existing.toObject();
      existingObject.id = existingObject._id.toString();
      console.log('Returning existing restaurant:', JSON.stringify(existingObject, null, 2));
      return existingObject;
    }
  } catch (dbFindError) {
    console.error('Error checking for existing restaurant:', dbFindError);
    throw new Error(`Database query error: ${dbFindError.message}`);
  }

  const input = args.input;
  console.log('Input for new restaurant:', JSON.stringify(input, null, 2));

  if (!input.name || !input.address) {
    console.error('Validation Error: Missing required fields for restaurant creation.');
    throw new Error('Restaurant name and address are required.');
  }

  // 创建餐厅 - 固定为 BASIC 套餐
  const basicLimits = SUBSCRIPTION_LIMITS.BASIC;
  const restaurant = new Restaurant({
    name: input.name,
    image: input.image || null,
    address: input.address || null,
    bossId: cognitoId,
    subscriptionPlan: "BASIC", // 固定为 BASIC
    subscriptionExpiry: null, // BASIC 版本无到期时间
    dishTypeLimit: basicLimits.dishTypes,
    dishLimit: basicLimits.dishes,
    waiterLimit: basicLimits.waiters
  });

  try {
    const savedRestaurant = await restaurant.save();
    
    // 更新用户记录，设置 restaurantId
    try {
      await User.findOneAndUpdate(
        { cognitoId: cognitoId },
        { $set: { restaurantId: savedRestaurant._id } },
        { new: true }
      );
      console.log('✅ Successfully updated user with restaurantId:', savedRestaurant._id);
    } catch (userUpdateError) {
      console.error('❌ Error updating user with restaurantId:', userUpdateError);
      // 注意：即使用户更新失败，餐厅已经创建成功，所以我们仍然返回餐厅信息
      // 在生产环境中，你可能需要考虑回滚餐厅创建或者记录这个错误以便后续处理
    }
    
    const resultObject = savedRestaurant.toObject();
    resultObject.id = resultObject._id.toString();
    console.log('Final object to be returned to AppSync:', JSON.stringify(resultObject, null, 2));
    return resultObject;
  } catch (saveError) {
    console.error('❌ Error saving restaurant to MongoDB:', saveError);
    if (saveError.code === 11000) {
      throw new Error("A restaurant with this name/bossId already exists.");
    }
    throw new Error(`Failed to save restaurant: ${saveError.message}`);
  }
};

// 更新餐厅基本信息
const updateRestaurantInfo = async (args, identity) => {
  console.log('Executing updateRestaurantInfo...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const input = args.input;
  
  if (!restaurantId) {
    throw new Error('Restaurant not found for this user');
  }

  // 构建更新数据
  const updateData = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.image !== undefined) updateData.image = input.image;
  if (input.address !== undefined) updateData.address = input.address;
  updateData.updatedAt = new Date();

  try {
    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      updateData,
      { new: true }
    );

    if (!updatedRestaurant) {
      throw new Error('Restaurant not found');
    }

    const resultObject = updatedRestaurant.toObject();
    resultObject.id = resultObject._id.toString();
    console.log('Restaurant info updated successfully:', JSON.stringify(resultObject, null, 2));
    return resultObject;
  } catch (error) {
    console.error('Error updating restaurant info:', error);
    throw error;
  }
};

// 更新餐厅订阅计划
const updateRestaurantSubscriptionPlan = async (args, identity) => {
  console.log('Executing updateRestaurantSubscriptionPlan...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const input = args.input;
  
  if (!restaurantId) {
    throw new Error('Restaurant not found for this user');
  }

  // 验证订阅计划
  if (!['BASIC', 'PREMIUM'].includes(input.subscriptionPlan)) {
    throw new Error('Invalid subscription plan');
  }

  // 设置限额基于订阅计划
  const planLimits = SUBSCRIPTION_LIMITS[input.subscriptionPlan];
  if (!planLimits) {
    throw new Error('Invalid subscription plan');
  }
  
  const limits = {
    dishTypeLimit: planLimits.dishTypes,
    dishLimit: planLimits.dishes,
    waiterLimit: planLimits.waiters
  };

  try {
    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      {
        subscriptionPlan: input.subscriptionPlan,
        subscriptionExpiry: input.subscriptionExpiry,
        ...limits,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedRestaurant) {
      throw new Error('Restaurant not found');
    }

    // 记录支付交易（这里可以扩展记录到单独的支付表）
    if (input.paymentTransactionId) {
      console.log('Payment transaction recorded:', input.paymentTransactionId);
    }

    const resultObject = updatedRestaurant.toObject();
    resultObject.id = resultObject._id.toString();
    console.log('Restaurant subscription updated successfully:', JSON.stringify(resultObject, null, 2));
    return resultObject;
  } catch (error) {
    console.error('Error updating restaurant subscription plan:', error);
    throw error;
  }
};

// 邀请服务员
const inviteWaiter = async (args, identity) => {
  console.log('Executing inviteWaiter...');
  const cognitoId = identity.sub;
  const groups = identity.claims && identity.claims['cognito:groups'] ? identity.claims['cognito:groups'] : [];
  
  if (!groups.includes("boss")) {
    throw new Error("Only boss users can invite waiters");
  }

  // 获取 boss 的餐厅
  const restaurant = await Restaurant.findOne({ bossId: cognitoId });
  if (!restaurant) {
    throw new Error('Restaurant not found for this boss');
  }

  // 检查服务员数量限额
  await checkWaiterLimit(restaurant._id);

  const { email } = args;
  if (!email) {
    throw new Error('Email is required to invite a waiter');
  }

  try {
    // 检查用户是否已存在
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      // 如果用户存在但被删除，可以重新激活
      if (existingUser.isDeleted) {
        const reactivatedUser = await User.findByIdAndUpdate(
          existingUser._id,
          {
            isDeleted: false,
            role: 'waiter',
            restaurantId: restaurant._id,
            updatedAt: new Date()
          },
          { new: true }
        );
        
        console.log('Waiter reactivated successfully:', reactivatedUser._id);
        return reactivatedUser.toJSON();
      } else {
        throw new Error('User with this email already exists and is active');
      }
    }

    // 创建新的服务员用户（注意：这里假设用户会通过 Cognito 注册流程）
    // 在实际应用中，您可能需要发送邀请邮件让用户完成注册
    const newWaiter = new User({
      email: email,
      cognitoId: null, // 将在用户注册时更新
      role: 'waiter',
      restaurantId: restaurant._id,
      isDeleted: false
    });

    const savedWaiter = await newWaiter.save();
    console.log('Waiter invited successfully:', savedWaiter._id);
    
    // TODO: 这里应该发送邀请邮件给服务员
    console.log('TODO: Send invitation email to:', email);
    
    return savedWaiter.toJSON();
  } catch (error) {
    console.error('Error inviting waiter:', error);
    throw error;
  }
};

// ====================================================================
// DISH TYPE MUTATIONS
// ====================================================================

// createDishType
const createDishType = async (args, identity) => {
  console.log('Executing createDishType...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const input = args.input;
  
  if (!input.name) {
    throw new Error('Dish type name is required.');
  }
  
  // 检查菜品分类数量限额
  await checkDishTypeLimit(restaurantId);
  
  try {
    // 检查同名分类是否已存在
    const existing = await DishType.findOne({ 
      restaurantId, 
      name: input.name, 
      isDeleted: { $ne: true } 
    });
    
    if (existing) {
      throw new Error('A dish type with this name already exists.');
    }
    
    const dishType = new DishType({
      restaurantId,
      name: input.name,
      alias: input.alias || null,
      sortOrder: input.sortOrder || 0,
      isDeleted: false
    });
    
    const savedDishType = await dishType.save();
    console.log('DishType created successfully:', savedDishType._id);
    return savedDishType.toJSON();
  } catch (err) {
    console.error(`Error creating dish type:`, err);
    throw new Error(`Failed to create dish type: ${err.message}`);
  }
};

// updateDishType
const updateDishType = async (args, identity) => {
  console.log('Executing updateDishType...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { id, input } = args;
  
  try {
    const dishType = await DishType.findOne({ 
      _id: id, 
      restaurantId, 
      isDeleted: { $ne: true } 
    });
    
    if (!dishType) {
      throw new Error('Dish type not found or already deleted.');
    }
    
    // 如果更新名称，检查是否与其他分类重名
    if (input.name && input.name !== dishType.name) {
      const existing = await DishType.findOne({ 
        restaurantId, 
        name: input.name, 
        isDeleted: { $ne: true },
        _id: { $ne: id }
      });
      
      if (existing) {
        throw new Error('A dish type with this name already exists.');
      }
    }
    
    // 更新字段
    if (input.name) dishType.name = input.name;
    if (input.alias !== undefined) dishType.alias = input.alias;
    if (input.sortOrder !== undefined) dishType.sortOrder = input.sortOrder;
    
    const updatedDishType = await dishType.save();
    return updatedDishType.toJSON();
  } catch (err) {
    console.error(`Error updating dish type ${id}:`, err);
    throw new Error(`Failed to update dish type: ${err.message}`);
  }
};

// deleteDishType（软删除）
const deleteDishType = async (args, identity) => {
  console.log('Executing deleteDishType...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { id } = args;
  
  try {
    const dishType = await DishType.findOne({ 
      _id: id, 
      restaurantId, 
      isDeleted: { $ne: true } 
    });
    
    if (!dishType) {
      throw new Error('Dish type not found or already deleted.');
    }
    
    // 检查是否有菜品引用此分类
    const dishesCount = await Dish.countDocuments({ 
      dishTypeId: id, 
      isDeleted: { $ne: true } 
    });
    
    if (dishesCount > 0) {
      throw new Error('Cannot delete dish type that has dishes. Please delete or reassign dishes first.');
    }
    
    dishType.isDeleted = true;
    const deletedDishType = await dishType.save();
    return deletedDishType.toJSON();
  } catch (err) {
    console.error(`Error deleting dish type ${id}:`, err);
    throw new Error(`Failed to delete dish type: ${err.message}`);
  }
};

// ====================================================================
// DISH MUTATIONS
// ====================================================================

// createDish
const createDish = async (args, identity) => {
  console.log('Executing createDish...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const input = args.input;
  
  if (!input.name || !input.dishTypeId || input.price == null) {
    throw new Error('Dish name, dish type, and price are required.');
  }
  
  // 检查菜品数量限额
  await checkDishLimit(restaurantId);
  
  try {
    // 验证 dishTypeId 是否存在且属于当前餐厅
    const dishType = await DishType.findOne({ 
      _id: input.dishTypeId, 
      restaurantId, 
      isDeleted: { $ne: true } 
    });
    
    if (!dishType) {
      throw new Error('Invalid dish type or dish type not found.');
    }
    
    const dish = new Dish({
      restaurantId,
      dishTypeId: input.dishTypeId,
      name: input.name,
      price: input.price,
      image: input.image || null,
      description: input.description || null,
      isAvailable: input.isAvailable !== undefined ? input.isAvailable : true,
      isDeleted: false
    });
    
    const savedDish = await dish.save();
    const dishObj = await Dish.findById(savedDish._id).populate('dishTypeId');
    const result = dishObj.toJSON();
    result.dishType = result.dishTypeId;
    return result;
  } catch (err) {
    console.error(`Error creating dish:`, err);
    throw new Error(`Failed to create dish: ${err.message}`);
  }
};

// updateDish
const updateDish = async (args, identity) => {
  console.log('Executing updateDish...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { id, input } = args;
  
  try {
    const dish = await Dish.findOne({ 
      _id: id, 
      restaurantId, 
      isDeleted: { $ne: true } 
    });
    
    if (!dish) {
      throw new Error('Dish not found or already deleted.');
    }
    
    // 如果更新 dishTypeId，验证其是否存在且属于当前餐厅
    if (input.dishTypeId && input.dishTypeId !== dish.dishTypeId.toString()) {
      const dishType = await DishType.findOne({ 
        _id: input.dishTypeId, 
        restaurantId, 
        isDeleted: { $ne: true } 
      });
      
      if (!dishType) {
        throw new Error('Invalid dish type or dish type not found.');
      }
    }
    
    // 更新字段
    if (input.dishTypeId) dish.dishTypeId = input.dishTypeId;
    if (input.name) dish.name = input.name;
    if (input.price !== undefined) dish.price = input.price;
    if (input.image !== undefined) dish.image = input.image;
    if (input.description !== undefined) dish.description = input.description;
    if (input.isAvailable !== undefined) dish.isAvailable = input.isAvailable;
    
    const updatedDish = await dish.save();
    const dishObj = await Dish.findById(updatedDish._id).populate('dishTypeId');
    const result = dishObj.toJSON();
    result.dishType = result.dishTypeId;
    return result;
  } catch (err) {
    console.error(`Error updating dish ${id}:`, err);
    throw new Error(`Failed to update dish: ${err.message}`);
  }
};

// deleteDish（软删除）
const deleteDish = async (args, identity) => {
  console.log('Executing deleteDish...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { id } = args;
  
  try {
    const dish = await Dish.findOne({ 
      _id: id, 
      restaurantId, 
      isDeleted: { $ne: true } 
    });
    
    if (!dish) {
      throw new Error('Dish not found or already deleted.');
    }
    
    dish.isDeleted = true;
    const deletedDish = await dish.save();
    const dishObj = await Dish.findById(deletedDish._id).populate('dishTypeId');
    const result = dishObj.toJSON();
    result.dishType = result.dishTypeId;
    return result;
  } catch (err) {
    console.error(`Error deleting dish ${id}:`, err);
    throw new Error(`Failed to delete dish: ${err.message}`);
  }
};

// updateDishAvailability
const updateDishAvailability = async (args, identity) => {
  console.log('Executing updateDishAvailability...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { id, isAvailable } = args;
  
  try {
    const dish = await Dish.findOne({ 
      _id: id, 
      restaurantId, 
      isDeleted: { $ne: true } 
    });
    
    if (!dish) {
      throw new Error('Dish not found or already deleted.');
    }
    
    dish.isAvailable = isAvailable;
    const updatedDish = await dish.save();
    const dishObj = await Dish.findById(updatedDish._id).populate('dishTypeId');
    const result = dishObj.toJSON();
    result.dishType = result.dishTypeId;
    return result;
  } catch (err) {
    console.error(`Error updating dish availability ${id}:`, err);
    throw new Error(`Failed to update dish availability: ${err.message}`);
  }
};

// ====================================================================
// ORDER MUTATIONS
// ====================================================================

// placeOrder
const placeOrder = async (args, identity) => {
  console.log('Executing placeOrder...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const cognitoId = identity.sub;
  const input = args.input;
  
  if (!input.tableNumber || !input.items || input.items.length === 0) {
    throw new Error('Table number and order items are required.');
  }
  
  try {
    // 获取下单用户信息
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
};

// checkoutOrder
const checkoutOrder = async (args, identity) => {
  console.log('Executing checkoutOrder...');
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
};

// updateOrderStatus
const updateOrderStatus = async (args, identity) => {
  console.log('Executing updateOrderStatus...');
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
};
