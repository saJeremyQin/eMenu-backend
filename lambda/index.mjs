import mongoose from 'mongoose';
import DishType from './models/dishType.js';
import Dish from './models/dish.js';
import Restaurant from './models/restaurant.js';

const DB_HOST = process.env.DB_HOST;

export const handler = async (event, context) => {
  try {
    console.log("🌐 Connecting to MongoDB...");

    // conncect database
    if(mongoose.connection.readyState === 0) {
      await mongoose.connect(DB_HOST);
    }

    const field = event.field;

    switch (field) {
      case "dishes":
        return await getDishes();
      case "createRestaurant":
        return await createRestaurant(event);
      default:
        throw new Error(`Unknown field: ${field}`);
    }

  } catch (error) {
    console.error("❌ Lambda error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'Internal server error',
        error: error.message }),
    };
  }
};

const getDishes = async () => {
  return await Promise.all(dishes.map(async (dish) => {
    const type = await DishType.findById(dish.type);
    return {
      id: dish._id.toString(),
      name: dish.name,
      description: dish.description,
      price: dish.price,
      image: dish.image,
      type: type ? {
        id: type._id.toString(),
        title: type.title,
        alias: type.alias,
      } : null,
    };
  }));
};

const createRestaurant = async (event) => {
  const input = event.arguments.input;
  const userId = event.identity.sub       // Get Cognito ID of curent user
  if (!userId) {
    throw new Error("Missing Cognito user identity (sub).");
  }

  // create restaurant data
  const newRestaurant = new Restaurant({
    ...input,
    bossId: userId, // 设置餐馆拥有者
    subscriptionPlan: 'BASIC', // 初始套餐
    subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 默认一个月
  });

  const saved = await newRestaurant.save();

  return {
    id: saved._id.toString(),
    name: saved.name,
    image: saved.image,
    address: saved.address,
    bossId: saved.bossId,
    subscriptionPlan: saved.subscriptionPlan,
    subscriptionExpiry: saved.subscriptionExpiry.toISOString(),
  };
};
