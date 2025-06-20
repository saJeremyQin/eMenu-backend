import mongoose from 'mongoose';
import Restaurant from './models/restaurant.js';
import Dish from './models/dish.js';
import DishType from './models/dishType.js';
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
  // to be done
};

const createRestaurant = async (event) => {
  const identity = event.identity; // 这是从 AppSync 传递过来的身份对象

  if (!identity) {
      console.error('No identity found in AppSync event context.');
      throw new Error('Authentication required.');
  }
  const sub = identity.sub;
  
  const groups = identity.claims && identity.claims['cognito:groups'] ? identity.claims['cognito:groups'] : [];
  console.log('user group is', groups);
  

  if (!sub) {
    throw new Error("Unauthorized: Missing user identity");
  }

  if (!groups || !groups.includes("boss")) {
    throw new Error("Only boss users can create restaurants");
  }

  const input = event.arguments.input;

  // Check if this boss already has a restaurant
  const existing = await Restaurant.findOne({ bossId: sub });
  if (existing) {
    throw new Error("You have already created a restaurant.");
  }
  const restaurant = new Restaurant({
    name: input.name,
    image: input.image || null,
    address: input.address || null,
    bossId: sub,
    subscriptionPlan: "BASIC",
    subscriptionExpiry: null,
  });

  await restaurant.save();
  return restaurant.toObject();
};
