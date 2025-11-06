import jwt from "jsonwebtoken";

// ====================================================================
// MODULAR RESOLVERS
// ====================================================================
import { resolvers as newResolvers } from './resolvers/index.js';
import { connectDb } from './utils/db.js';

// ====================================================================
// LAMBDA HANDLER
// ====================================================================

export const handler = async (event, context) => {
  try {
    console.log('Received AppSync event:', JSON.stringify(event, null, 2));

    await connectDb();

    const field = event.fieldName;
    const typeName = event.typeName;
    const identity = event.identity;

    // Skip authentication check for registerWaiter (uses API Key)
    if (field !== 'registerWaiter') {
      if (!identity || !identity.sub) {
        console.error('Auth Check: No identity found or missing sub in AppSync event context.');
        throw new Error('Authentication required.');
      }
      console.log('Auth Check: Identity object from AppSync:', JSON.stringify(identity, null, 2));
      console.log('Auth Check: User ID (sub):', identity.sub);
    } else {
      console.log('Auth Check: Skipping for registerWaiter (API Key access)');
    }

    // ====================================================================
    // FIELD RESOLVERS
    // Field resolvers handle nested object resolution (e.g., Dish.dishType)
    // They receive the parent object in event.source
    // ====================================================================
    if (typeName && typeName !== 'Query' && typeName !== 'Mutation') {
      console.log(`FieldResolver: Resolving ${typeName}.${field}`);
      
      // Dish.dishType field resolver
      if (typeName === 'Dish' && field === 'dishType') {
        try {
          console.log('FieldResolver: Dish.dishType invoked for parent dish:', JSON.stringify(event.source, null, 2));
          return await newResolvers.Dish.dishType(event.source);
        } catch (e) {
          console.error('FieldResolver Error: Dish.dishType failed:', e);
          throw e;
        }
      }
      
      // Future field resolvers can be added here
      // e.g., Order.items, Order.waiter, etc.
      
      throw new Error(`Unknown field resolver: ${typeName}.${field}`);
    }

    // ====================================================================
    // QUERY & MUTATION RESOLVERS
    // Top-level resolvers for queries and mutations
    // ====================================================================
    
    // Query resolvers
    if (typeName === 'Query') {
      if (newResolvers.Query[field]) {
        return await newResolvers.Query[field](event.arguments, identity);
      }
      throw new Error(`Unknown Query field: ${field}`);
    }
    
    // Mutation resolvers
    if (typeName === 'Mutation') {
      if (newResolvers.Mutation[field]) {
        return await newResolvers.Mutation[field](event.arguments, identity);
      }
      throw new Error(`Unknown Mutation field: ${field}`);
    }

    throw new Error(`Unknown operation type: ${typeName}`);

  } catch (error) {
    console.error("❌ Lambda execution failed:", error);
    throw error;
  }
};
