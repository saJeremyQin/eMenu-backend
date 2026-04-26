import Restaurant from '/opt/nodejs/models/restaurant.js';
import User from '/opt/nodejs/models/user.js';
import { getRestaurantIdFromIdentity, requireRole } from '../utils/auth.js';
import { SUBSCRIPTION_LIMITS } from '../config/constants.js';

// 查询：获取当前用户所属的餐厅信息
export async function getRestaurant(args, identity) {
  console.log('Executing getRestaurant...');
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  try {
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      console.error(`Restaurant with id ${restaurantId} not found.`);
      return null;
    }
    return restaurant.toJSON();
  } catch (err) {
    console.error(`Error fetching restaurant ${restaurantId}:`, err);
    throw new Error(`Failed to fetch restaurant: ${err.message}`);
  }
}

// 创建餐厅 - 固定为 FREE 版本
export async function createRestaurant(args, identity) {
  console.log('Executing createRestaurant...');
  const cognitoId = identity.sub;
  const groups = identity.claims && identity.claims['cognito:groups'] ? identity.claims['cognito:groups'] : [];
  if (!groups.includes("boss")) {
    console.error('Auth Check (in createRestaurant): User not in "boss" group. Groups:', groups);
    throw new Error("Only boss users can create restaurants");
  }
  try {
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
  const input = args?.input || args;
  console.log('Input for new restaurant:', JSON.stringify(input, null, 2));
  const name = (input.name || '').trim();
  if (!name || !input.address) {
    console.error('Validation Error: Missing required fields for restaurant creation.');
    throw new Error('Restaurant name and address are required.');
  }
  const freeLimits = SUBSCRIPTION_LIMITS.FREE;
  const restaurant = new Restaurant({
    name,
    logoUrl: input.logoUrl || input.image || null,
    address: input.address || null,
    phone: input.phone || null,
    bossId: cognitoId,
    subscriptionPlan: "FREE",
    subscriptionExpiry: null,
    dishTypeLimit: freeLimits.dishTypes,
    dishLimit: freeLimits.dishes,
    waiterLimit: freeLimits.waiters,
    tableLimit: freeLimits.tables
  });
  try {
    const savedRestaurant = await restaurant.save();
    try {
      await User.findOneAndUpdate(
        { cognitoId: cognitoId },
        { $set: { restaurantId: savedRestaurant._id } },
        { new: true }
      );
      console.log('✅ Successfully updated user with restaurantId:', savedRestaurant._id);
    } catch (userUpdateError) {
      console.error('❌ Error updating user with restaurantId:', userUpdateError);
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
}

// 更新餐厅基本信息
export async function updateRestaurantInfo(args, identity) {
  console.log('Executing updateRestaurantInfo...');
  console.log('Args:', JSON.stringify(args, null, 2));
  console.log('Identity:', JSON.stringify(identity, null, 2));
  await requireRole(identity, ['boss']);
  try {
    const restaurantId = await getRestaurantIdFromIdentity(identity);
    console.log('Restaurant ID:', restaurantId);
    const input = args?.input || args;
    console.log('Input data:', JSON.stringify(input, null, 2));
    if (!restaurantId) {
      throw new Error('Restaurant not found for this user');
    }
    const updateData = {};
      if (input.name !== undefined) updateData.name = (input.name || '').trim();
  if (input.logoUrl !== undefined) updateData.logoUrl = input.logoUrl;
  else if (input.image !== undefined) updateData.logoUrl = input.image;
    if (input.address !== undefined) updateData.address = input.address;
    if (input.phone !== undefined) updateData.phone = input.phone;
    updateData.updatedAt = new Date();
    console.log('Update data:', JSON.stringify(updateData, null, 2));
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
    console.error('Error stack:', error.stack);
    throw error;
  }
}

// 更新餐厅订阅计划
export async function updateRestaurantSubscriptionPlan(args, identity) {
  console.log('Executing updateRestaurantSubscriptionPlan...');
  await requireRole(identity, ['boss']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const input = args?.input || args;
  if (!restaurantId) {
    throw new Error('Restaurant not found for this user');
  }
  if (!['FREE', 'PRO'].includes(input.subscriptionPlan)) {
    throw new Error('Invalid subscription plan');
  }
  const planLimits = SUBSCRIPTION_LIMITS[input.subscriptionPlan];
  if (!planLimits) {
    throw new Error('Invalid subscription plan');
  }
  const limits = {
    dishTypeLimit: planLimits.dishTypes,
    dishLimit: planLimits.dishes,
    waiterLimit: planLimits.waiters,
    tableLimit: planLimits.tables
  };

  const normalizedExpiry = input.subscriptionPlan === 'FREE'
    ? null
    : (input.subscriptionExpiry || null);

  try {
    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      {
        subscriptionPlan: input.subscriptionPlan,
        subscriptionExpiry: normalizedExpiry,
        ...limits,
        updatedAt: new Date()
      },
      { new: true }
    );
    if (!updatedRestaurant) {
      throw new Error('Restaurant not found');
    }
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
}
