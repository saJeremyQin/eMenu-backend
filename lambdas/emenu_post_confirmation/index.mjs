import pkg from "@aws-sdk/client-cognito-identity-provider";
const { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } = pkg;
import mongoose from 'mongoose';
import User from "/opt/nodejs/models/user.js";
import { SSMClient, GetParameterCommand} from "@aws-sdk/client-ssm";

// Initialize AWS SDK client outside the handler to leverage Lambda warm starts.
const cognitoClient = new CognitoIdentityProviderClient({ region: "ap-southeast-2" });

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


export const handler = async (event) => {
    console.log("--- Post Confirmation Lambda Started ---");
    console.log("Full event received:", JSON.stringify(event, null, 2));

    // Always attempt to connect to the database before processing logic
    try {
        await connectDb();
    } catch (err) {
        console.error("❌ Failed to connect to DB for Post Confirmation Lambda:", err);
        // Even if DB connection fails, we should return the event to avoid hanging the Cognito registration flow
        return event;
    }

    const userPoolId = event.userPoolId;
    const username = event.userName; // This will be the email if email is the login method
    const userSub = event.request.userAttributes.sub; // The user's unique ID (sub)
    const userEmail = event.request.userAttributes.email;

    // Determine the user's initial role based on business logic
    let assignedRole = "waiter"; // Default role
    const targetClientId = "40nv3qru4flrlbcjftgq7qd7q0";

      // 1. Add user to the 'boss' user group (based on clientId)
    if (event.callerContext && event.callerContext.clientId && event.callerContext.clientId === targetClientId) {
        console.log(`Client ID matched (${targetClientId}). Attempting to add user to 'boss' group.`);
        try {
            const groupName = "boss";
            const command = new AdminAddUserToGroupCommand({
                GroupName: groupName,
                UserPoolId: userPoolId,
                Username: username, // Use username which is the email in this setup
            });
            await cognitoClient.send(command);
            console.log(`✅ Successfully added ${username} to group ${groupName}`);
            assignedRole = "boss"; // If successfully added to boss group, update the role
        } catch (error) {
            console.error("❌ Error adding user to group:", error);
            // Note: Even if group assignment fails, the Lambda will still return the event, allowing user registration to complete
            // But in a real-world scenario, you might want to log this failure for alerting or auditing.
        }
    } else {
        console.log(`Client ID did NOT match. Expected: ${targetClientId}, Received: ${event.callerContext ? event.callerContext.clientId : 'undefined'}. Assigning default role '${assignedRole}'.`);
    }

    // 2. Insert User record into MongoDB
    try {
        // Check if the user already exists (to prevent duplicate triggers or ensure idempotency)
        const existingUser = await User.findOne({ sub: userSub });
        if (!existingUser) {
            console.log(`Creating new user record for ${userEmail} in MongoDB with role: ${assignedRole}`);
            console.log(`the userSub is ${userSub}, email is ${userEmail}`);
            
            const newUser = new User({
                sub: userSub,             // 将 userSub 赋值给 sub 字段
                email: userEmail,
                role: assignedRole,
                restaurantId: undefined 
            });

            await newUser.save();
            console.log(`✅ Successfully created user record in MongoDB for ${userEmail}`);
        } else {
            console.log(`User record for ${userEmail} (sub: ${userSub}) already exists in MongoDB. Updating existing record.`);
            // Optional: If the user record exists, you might want to update its role or other attributes
            await User.updateOne({ sub: userSub }, { $set: { role: assignedRole } });
            console.log(`✅ User record for ${userEmail} updated in MongoDB.`);
        }
    } catch (error) {
        console.error("❌ Error creating/updating user record in MongoDB:", error);
    }
    console.log("--- Post Confirmation Lambda Ended ---");
    return event; // Post Confirmation trigger Lambdas must return the original event object
}
