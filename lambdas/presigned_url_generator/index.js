import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { buildS3AndProcessedKeys } from './image_uploader/index.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION || "ap-southeast-2" });
const BUCKET_NAME = process.env.S3_BUCKET;

export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // 处理 OPTIONS 预检请求
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      body: ''
    };
  }

  // 处理不同的事件格式（Lambda URL vs API Gateway）
  let body;
  if (event.body) {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } else {
    body = event;
  }

  try {
    // 解析请求
    const { 
      authToken, 
      fileName, 
      contentType = 'image/jpeg',
      imageType = 'restaurant-logo' // 'restaurant-logo' | 'dish-image'
    } = body;

    // 验证必需参数
    if (!authToken || !fileName) {
      console.log('Missing parameters:', { authToken: !!authToken, fileName: !!fileName });
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing authToken or fileName'
        })
      };
    }

    console.log('Received authToken length:', authToken.length);
    console.log('AuthToken starts with:', authToken.substring(0, 20) + '...');

    // 从 Cognito JWT 中提取用户信息
    // 注意：在生产环境中，你应该验证 JWT 签名
    const decodedToken = jwt.decode(authToken);
    console.log('Decoded token:', decodedToken ? 'Success' : 'Failed');
    if (decodedToken) {
      console.log('Token issuer:', decodedToken.iss);
      console.log('Token subject:', decodedToken.sub);
      console.log('Token audience:', decodedToken.aud);
    }
    
    if (!decodedToken || !decodedToken.sub) {
      console.log('Token validation failed');
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'Invalid or missing authentication token'
        })
      };
    }

    const userSub = decodedToken.sub;
    console.log(`Generating presigned URL for user: ${userSub}`);

    // 生成唯一文件名
    const fileId = randomUUID();
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${fileId}.${fileExtension}`;    

    // 使用共享 helper 构建 s3Key / expectedProcessedKey（支持不同 imageType）
    const { s3Key, expectedProcessedKey } = buildS3AndProcessedKeys({
      imageType,
      userSub,
      uniqueFileName,
      fileId
    });

    // 创建预签名 URL 的参数
    const putObjectParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
      Metadata: {
        'user-sub': userSub,
        'original-filename': fileName,
        'upload-timestamp': new Date().toISOString(),
        'image-type': imageType
      }
    };

    // 生成预签名 URL（5分钟过期）
    const command = new PutObjectCommand(putObjectParams);
    const presignedUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 300 // 5分钟
    });

    console.log(`Generated presigned URL for key: ${s3Key}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        presignedUrl,
        s3Key,
        expiresIn: 300,
        expectedProcessedKey
      })
    };

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error'
      })
    };
  }
};
