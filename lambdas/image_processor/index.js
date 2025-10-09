import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import Jimp from 'jimp';

const s3Client = new S3Client({ region: process.env.AWS_REGION || "ap-southeast-2" });
const BUCKET_NAME = process.env.S3_BUCKET;

export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    
    console.log(`Processing file: ${key}`);

    try {
      // 检查是否是餐厅logo原始文件 - 支持两种路径结构
      // 1. 基于User Pool sub的路径: public/restaurant-logos/{userSub}/raw/{filename}
      // 2. 直接上传测试路径: public/restaurant-logos/{filename}
      const restaurantLogoMatch = key.match(/^public\/restaurant-logos\/([^\/]+)\/raw\/(.+)$/) || 
                                 key.match(/^public\/restaurant-logos\/([^\/]+\.(jpg|jpeg|png))$/i);
      
      if (!restaurantLogoMatch) {
        console.log('File path does not match restaurant logo pattern, skipping');
        continue;
      }

      let userSub, filename;
      if (restaurantLogoMatch[2] && restaurantLogoMatch[3]) {
        // 直接上传格式: public/restaurant-logos/filename.ext
        userSub = 'test-user'; // 测试用户
        filename = restaurantLogoMatch[1];
      } else {
        // 标准格式: public/restaurant-logos/{userSub}/raw/{filename}
        [, userSub, filename] = restaurantLogoMatch;
      }
      
      console.log(`Processing restaurant logo for User Pool sub: ${userSub}, file: ${filename}`);

      // 检查文件类型
      const contentType = await getContentType(bucket, key);
      if (!contentType || !contentType.startsWith('image/')) {
        console.log(`Skipping non-image file: ${key}`);
        continue;
      }

      // 从S3获取原始图片
      const getObjectParams = {
        Bucket: bucket,
        Key: key
      };
      
      const getObjectCommand = new GetObjectCommand(getObjectParams);
      const originalImage = await s3Client.send(getObjectCommand);
      
      // 验证metadata中的用户信息（如果存在）
      if (originalImage.Metadata && originalImage.Metadata['user-sub']) {
        const metadataUserSub = originalImage.Metadata['user-sub'];
        if (metadataUserSub !== userSub) {
          console.error(`Security violation: File path user ${userSub} doesn't match metadata user ${metadataUserSub}`);
          continue;
        }
        console.log(`User verification passed for: ${userSub}`);
      }
      
      // 将流转换为Buffer
      const chunks = [];
      for await (const chunk of originalImage.Body) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);
      
      // 使用Jimp处理图片 - 餐厅logo标准化为300x300
      const image = await Jimp.read(imageBuffer);
      const processedImageBuffer = await image
        .cover(300, 300) // 裁剪并缩放到300x300，保持宽高比
        .quality(85) // 设置JPEG质量
        .getBufferAsync(Jimp.MIME_JPEG);

      // 生成处理后的文件名，保存路径根据上传类型决定
      const fileNameWithoutExt = filename.split('.')[0];
      let processedKey;
      
      if (userSub === 'test-user') {
        // 直接上传的测试文件，保存到processed目录
        processedKey = `public/restaurant-logos/processed/${fileNameWithoutExt}.jpg`;
      } else {
        // 标准用户上传，保存到用户专属的processed目录
        processedKey = `public/restaurant-logos/${userSub}/processed/${fileNameWithoutExt}.jpg`;
      }

      // 上传处理后的图片
      const putObjectParams = {
        Bucket: bucket,
        Key: processedKey,
        Body: processedImageBuffer,
        ContentType: 'image/jpeg',
        CacheControl: 'max-age=31536000', // 1年缓存
        Metadata: {
          'original-key': key,
          'processed-at': new Date().toISOString(),
          'user-sub': userSub, // 保持用户标识用于后续验证
          'processed-by': 'lambda-image-processor'
        }
      };

      const putObjectCommand = new PutObjectCommand(putObjectParams);
      await s3Client.send(putObjectCommand);
      console.log(`Successfully processed and saved: ${processedKey}`);

    } catch (error) {
      console.error(`Error processing ${key}:`, error);
      // 不抛出错误，继续处理其他文件
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify('Images processed successfully')
  };
};

async function getContentType(bucket, key) {
  try {
    const headObjectCommand = new HeadObjectCommand({ Bucket: bucket, Key: key });
    const headResult = await s3Client.send(headObjectCommand);
    return headResult.ContentType;
  } catch (error) {
    console.error(`Error getting content type for ${key}:`, error);
    return null;
  }
}