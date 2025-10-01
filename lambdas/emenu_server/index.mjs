import mongoose from 'mongoose';
import Restaurant from '/opt/nodejs/models/restaurant.js';
import User from '/opt/nodejs/models/user.js';
import Dish from '/opt/nodejs/models/dish.js';
import DishType from '/opt/nodejs/models/dishType.js';
import { SSMClient, GetParameterCommand} from "@aws-sdk/client-ssm";

let cachedDbUri = null;

const connectDb = async () => {
  if (mongoose.connection.readyState !== 0) {
    console.log("🔗 MongoDB already connected.");
    return;
  }

  if(!cachedDbUri) {
    const ssmClient = new SSMClient({region: "ap-southeast-2"});
    const paramName = process.env.DB_PARAM_NAME;

    if(!paramName) {
      throw new Error("DB_PARAM_NAME is not set in environment variables.");
    }

    try {
      console.log("🔍 Retrieving MongoDB URI from SSM...");
      const command = new GetParameterCommand({
        Name: paramName,
        WithDecryption: true
      })

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

// Helper function to get restaurantId from user identity (re-used for multiple resolvers)
// const getRestaurantIdFromIdentity = async (identity) => {
//   if (!identity || !identity.sub) {
//     throw new Error("Authentication required: User identity is missing.");
//   }
//   const user = await User.findOne({ sub: identity.sub });
//   if (!user) {
//     throw new Error("User not found.");
//   }
//   if (!user.restaurantId) {
//     throw new Error("User is not associated with a restaurant.");
//   }
//   return user.restaurantId;
// };
async function getRestaurantIdFromIdentity(identity) {
  const cognitoId = identity?.sub || identity?.claims?.sub;
  console.log("DEBUG: cognitoId is", cognitoId);
  console.log("DEBUG: mongoose connection is", mongoose.connection.name, mongoose.connection.host);
  console.log("DEBUG: User collection is", User.collection.name);

  if (!cognitoId) throw new Error("Cognito identity sub not found.");
  const user = await User.findOne({ cognitoId });
  if (!user) {
    // 打印所有用户，便于你排查
    const count = await User.countDocuments();
    const allUsers = await User.find().limit(5);
    console.error("DEBUG: First 5 users in DB:", allUsers);
    throw new Error("User not found.");
  }
  return user.restaurantId;
}


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

    const sub = identity.sub;
    console.log('Auth Check: User ID (sub):', sub);
    
    if (!sub) {
      console.error('Auth Check: Missing user identity (sub).');
      throw new Error("Unauthorized: Missing user identity");
    }

    switch (field) {
      case "getUser":
        return await getUser(event.arguments, identity);
      case "listDishes":
        return await listDishes(event, context);
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

const getUser = async (args, identity) => {
  console.log('Executing getUser...');
  const requestedSub = args.id; // The 'id' parameter from the GraphQL query
  const callerSub = identity.sub; // The 'sub' of the authenticated caller
  const callerGroups = identity.claims && identity.claims['cognito:groups'] ? identity.claims['cognito:groups'] : [];

  console.log(`getUser request: Caller Sub: ${callerSub}, Requested Sub: ${requestedSub}`);
  console.log(`Caller Groups: ${callerGroups.join(', ')}`);

  // Authorization check
  // 1. If caller is an 'admin', they can query any user
  if (callerGroups.includes("admin")) {
    console.log(`Authorization: Caller ${callerSub} is an admin. Allowing query for ${requestedSub}.`);
  } 
  // 2. If not an admin, check if the requested ID matches the caller's ID
  else if (requestedSub === callerSub) {
    console.log(`Authorization: Caller ${callerSub} is querying their own user data. Allowing.`);
  } 
  // 3. Otherwise, unauthorized
  else {
    console.error(`Authorization: Caller ${callerSub} is not authorized to query user ${requestedSub}. Not an admin and not querying own data.`);
    throw new Error("Unauthorized: You are not authorized to access this user's information.");
  }
  
  try {
    const user = await User.findOne({ sub: requestedSub }); // Query using the requestedSub
    if (!user) {
      console.error(`User with sub ${requestedSub} not found.`);
      return null;
    }
    return user.toJSON(); 
  } catch (err) {
    console.error(`Error fetching user ${requestedSub}:`, err);
    throw new Error(`Failed to fetch user: ${err.message}`);
  }
};

// const listDishes = async (identity) => {
//   console.log('Executing listDishes...');
//   const restaurantId = await getRestaurantIdFromIdentity(identity);
//   console.log('The user\'s restaurantId is:', restaurantId);

//   // Key change: Use populate to get DishType data
//   const dishes = await Dish.find({ restaurantId: restaurantId }).populate('dishTypeId');          

//   return dishes.map( d => {
//     const dishObj = d.toJSON();
//     dishObj.dishType = dishObj.dishTypeId;
//     return dishObj;
//   });
//   // To Be updated 
// };
export async function listDishes(event, context) {
  console.info("Executing listDishes...");
  const identity = event.identity;
  
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  console.log('restaurantId is %s', restaurantId);
  

  // 根据传入参数决定是否按分类过滤
  const { dishTypeId } = event.arguments || {};
  console.log('dishTypeId inside is $s', dishTypeId);
  
  const filter = { restaurantId };
  if (dishTypeId) filter.dishTypeId = dishTypeId;

  const dishes = await Dish.find(filter).populate('dishTypeId');
  
  return dishes.map(d => {
    const dishObj = d.toJSON();
    dishObj.dishType = dishObj.dishTypeId; // 兼容 GraphQL schema 的 dishType 字段
    return dishObj;
  });
}

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