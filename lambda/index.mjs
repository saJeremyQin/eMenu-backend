import mongoose from 'mongoose';
import DishType from './models/dishType.js';
import Dish from './models/dish.js';
import Restaurant from './models/restaurant.js';
import User from './models/user.js';

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
      case "listDishes":
        return await listDishes(event);
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

const listDishes = async (event) => {
  const userSub = event.identity?.sub;
  if (!userSub) {
    throw new Error("Unauthorized: missing user sub");
  }

  const user = await User.findOne({ sub: userSub });
  if (!user || !user.restaurantId) {
    throw new Error("User not linked to a restaurant");
  }

  const dishes = await Dish.find({ restaurantId: user.restaurantId });

  return dishes.map(dish => ({
    id: dish._id.toString(),
    name: dish.name,
    description: dish.description,
    price: dish.price,
    image: dish.image,
    dishTypeId: dish.dishTypeId?.toString(),
    restaurantId: dish.restaurantId?.toString(),
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

  await User.updateOne({ sub: userId }, { $set: { restaurantId: saved._id } });

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
