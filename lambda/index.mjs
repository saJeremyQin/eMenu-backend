import mongoose from 'mongoose';
import DishType from './models/dishType.js';
import Dish from './models/dish.js';

const DB_HOST = process.env.DB_HOST;

export const handler = async (event, context) => {
  try {
    console.log("🌐 Connecting to MongoDB...");

    // conncect database
    if(mongoose.connection.readyState === 0) {
      await mongoose.connect(DB_HOST);
    }
    console.log("Mongoose readyState:", mongoose.connection.readyState);

    // look for all the dishes
    const dishes = await Dish.find();

    const dishesWithType = await Promise.all(
      dishes.map(async (dish) => {
        const typeObj = await DishType.findById(dish.type);
        return {
          id: dish._id.toString(),  // 确保返回 string id
          name: dish.name,
          description: dish.description,
          price: dish.price,
          image: dish.image,
          type: typeObj
            ? {
                id: typeObj._id.toString(),
                title: typeObj.title,
                alias: typeObj.alias,
              }
            : null,
        };
      })
    );

   return dishesWithType;
  } catch (error) {
    console.error('Error in dishes-lambda:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'Internal server error',
        error: error.message }),
    };
  }
};



