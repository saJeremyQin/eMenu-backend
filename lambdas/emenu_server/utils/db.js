/**
 * 数据库连接工具
 * 管理 MongoDB 连接并从 SSM Parameter Store 获取连接字符串
 */
import mongoose from "mongoose";
import { GetParameterCommand } from "@aws-sdk/client-ssm";
import { ssmClient } from '../config/aws-clients.js';

let cachedDbUri = null;

/**
 * 连接到 MongoDB
 * - 使用缓存的数据库 URI 避免重复调用 SSM
 * - 检查现有连接状态以避免重复连接
 */
export const connectDb = async () => {
  if (mongoose.connection.readyState !== 0) {
    console.log("🔗 MongoDB already connected.");
    return;
  }

  if (!cachedDbUri) {
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
      // Never log the URI: it contains the database password.
      console.log("✅ Successfully retrieved DB URI from SSM.");
    } catch (error) {
      console.error("❌ Failed to retrieve DB URI from SSM:", error);
      throw new Error("Failed to retrieve DB URI from SSM");
    }
  }

  try {
    console.log("🌐 Attempting to connect to MongoDB...");
    // Fail fast (default is 30s, the same as the Lambda timeout) so an unreachable
    // cluster, e.g. a blocked Atlas IP access list, surfaces as a clear error.
    await mongoose.connect(cachedDbUri, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ MongoDB connected successfully!");
  } catch (dbError) {
    console.error("❌ MongoDB connection failed:", dbError);
    throw new Error(`Database connection failed: ${dbError.message}`);
  }
};
