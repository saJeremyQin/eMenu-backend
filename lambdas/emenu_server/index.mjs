import mongoose from 'mongoose';
import Restaurant from '/opt/nodejs/models/restaurant.js';
import User from '/opt/nodejs/models/user.js';

const DB_HOST = process.env.DB_HOST;

const connectDb = async () => {
  if (mongoose.connection.readyState === 0) {
    try {
      console.log("🌐 Attempting to connect to MongoDB...");
      await mongoose.connect(DB_HOST);
      console.log("✅ MongoDB connected successfully!");
    } catch (dbError) {
      console.error("❌ MongoDB connection failed:", dbError);
      throw new Error(`Database connection failed: ${dbError.message}`);
    }
  } else {
    console.log("🔗 MongoDB already connected.");
  }
};


export const handler = async (event, context) => {
  try {
    console.log('Received AppSync event:', JSON.stringify(event, null, 2));

    await connectDb();

    const field = event.field;
    const identity = event.identity;

    if (!identity) {
      console.error('Auth Check: No identity found in AppSync event context.');
      throw new Error('Authentication required.');
    }
    console.log('Auth Check: Identity object from AppSync:', JSON.stringify(identity, null, 2));

    const sub = identity.sub;
    console.log('Auth Check: User ID (sub):', sub);
    
    if (!sub) {
      console.error('Auth Check: Missing user identity (sub).');
      throw new Error("Unauthorized: Missing user identity");
    }

    switch (field) {
      case "listDishes":
        return await listDishes(event.arguments, identity);
      case "createRestaurant":
        return await createRestaurant(event.arguments, identity);
      default:
        console.error(`Unknown field: ${field}`);
        throw new Error(`Unknown field: ${field}`);
    }

  } catch (error) {
    console.error("❌ Lambda execution failed:", error);
    throw error;
  }
};

const listDishes = async (args, identity) => {
  console.log('Executing listDishes...');

  const sub = identity.sub;

  const user = await User.findOne({ sub: sub });
  if (!user) {
    throw new Error("User not found");
  }  

  if (!user.restaurantId) {
    throw new Error("User has no restaurant assigned");
  }
  console.log('The restaurantId is', user.restaurantId);


  const dishes = await Dish.find({ restaurantId: user.restaurantId });

  // 转换格式以便 GraphQL 接收
  return dishes.map(d => d.toJSON());
};

const createRestaurant = async (args, identity) => {
  console.log('Executing createRestaurant...');
  const sub = identity.sub;

  const groups = identity.claims && identity.claims['cognito:groups'] ? identity.claims['cognito:groups'] : [];
  console.log('Auth Check (in createRestaurant): User groups:', groups);
  if (!groups.includes("boss")) {
    console.error('Auth Check (in createRestaurant): User not in "boss" group. Groups:', groups);
    throw new Error("Only boss users can create restaurants");
  }


  try {
    const existing = await Restaurant.findOne({ bossId: sub });
    if (existing) {
      console.warn(`Attempted to create restaurant for existing bossId: ${sub}. Returning existing restaurant.`);
      // convert it manually
      const existingObject = existing.toObject();
      existingObject.id = existingObject._id.toString(); // 强制映射 _id 到 id
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

  const restaurant = new Restaurant({
    name: input.name,
    image: input.image || null,
    address: input.address || null,
    bossId: sub,
    subscriptionPlan: input.subscriptionPlan || "BASIC",
    subscriptionExpiry: input.subscriptionExpiry || null,
  });

  console.log('Mongoose Restaurant instance created (before save):', JSON.stringify(restaurant.toObject(), null, 2));

  try {
    const savedRestaurant = await restaurant.save();
    console.log('✅ Restaurant saved to MongoDB (raw object):', JSON.stringify(savedRestaurant.toObject(), null, 2));

    // ****** 重新添加手动映射作为诊断步骤 ******
    const resultObject = savedRestaurant.toObject();
    resultObject.id = resultObject._id.toString(); // 强制将 MongoDB 的 _id 转换为字符串并赋值给 id

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