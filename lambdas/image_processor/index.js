import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import Jimp from 'jimp';
import { buildS3AndProcessedKeys } from './image_uploader/index.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION || "ap-southeast-2" });


export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    
    console.log(`Processing file: ${key}`);

    try {
      // 支持两类资源：restaurant-logos 和 dish-images；每类同时支持带 userSub 的 raw 路径和直接上传测试路径
      const restaurantRaw = key.match(/^public\/restaurant-logos\/([^\/]+)\/raw\/(.+)$/);
      const restaurantDirect = key.match(/^public\/restaurant-logos\/([^\/]+\.(jpg|jpeg|png))$/i);

      const dishRaw = key.match(/^public\/dish-images\/([^\/]+)\/raw\/(.+)$/);
      const dishDirect = key.match(/^public\/dish-images\/([^\/]+\.(jpg|jpeg|png))$/i);

      let resourceType = null;
      let match = null;

      if (restaurantRaw || restaurantDirect) {
        resourceType = 'restaurant-logo';
        match = restaurantRaw || restaurantDirect;
      } else if (dishRaw || dishDirect) {
        resourceType = 'dish-image';
        match = dishRaw || dishDirect;
      } else {
        console.log('File path does not match supported patterns, skipping');
        continue;
      }

      let userSub, filename;
      // direct 匹配：match[1] 为 filename
      if ((resourceType === 'restaurant-logo' && restaurantDirect) || (resourceType === 'dish-image' && dishDirect)) {
        userSub = 'test-user';
        filename = match[1];
      } else {
        // raw 匹配： match[1] = userSub, match[2] = filename
        [, userSub, filename] = match;
      }

      console.log(`Processing ${resourceType} for User Pool sub: ${userSub}, file: ${filename}`);

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

      // 额外的文件头嗅探：有时 ContentType metadata 可能不正确（扩展名或上传头错写），
      // 我们在内存中检查前几个字节以检测典型容器格式（例如 AVIF 的 ftyp box）。
      const bufferMime = detectMimeFromBuffer(imageBuffer);
      if (bufferMime && bufferMime !== (contentType || '').toLowerCase()) {
        console.warn(`ContentType metadata (${contentType}) differs from sniffed buffer mime (${bufferMime}) for ${key}`);
      }

      // 生成处理后的文件名，保存路径根据资源类型与上传类型决定
      const fileNameWithoutExt = filename.split('.')[0];
      let processedKey;

      if (userSub === 'test-user') {
        // 直接上传的测试文件：放在顶级 processed 目录以便本地/测试查看
        if (resourceType === 'dish-image') {
          processedKey = `public/dish-images/processed/${fileNameWithoutExt}.jpg`;
        } else {
          processedKey = `public/restaurant-logos/processed/${fileNameWithoutExt}.jpg`;
        }
      } else {
        // 标准用户上传：使用共享 helper 来确保与 presign 规则一致
        const { expectedProcessedKey } = buildS3AndProcessedKeys({
          imageType: resourceType === 'dish-image' ? 'dish-image' : 'restaurant-logo',
          userSub,
          uniqueFileName: filename,
          fileId: fileNameWithoutExt
        });
        processedKey = expectedProcessedKey;
      }

      // 如果 MIME 类型不是 Jimp 支持的（例如 image/avif），优雅地处理：写入失败标记并跳过处理
      const jimpSupported = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/bmp',
        'image/tiff',
        'image/webp'
      ];

      // 将 sniff 到的 mime 与 HeadObject 的 ContentType 结合判断，优先使用 buffer 嗅探结果（更可靠）
      const effectiveMime = bufferMime || (contentType || '').toLowerCase();

      if (!jimpSupported.includes(effectiveMime)) {
        const failureBody = `Unsupported MIME type: ${contentType} - Lambda image processor does not support this format for server-side processing.`;
        console.warn(`Unsupported MIME type for ${key}: ${contentType}`);

        // 上传一个小的 failure marker 到 processed 目录，便于排查（不暴露给客户端为公共资源）
        const failureKey = `${processedKey}.processing_failed.txt`;
        try {
          const putFailureParams = {
            Bucket: bucket,
            Key: failureKey,
            Body: Buffer.from(failureBody),
            ContentType: 'text/plain',
            Metadata: {
              'original-key': key,
              'processed-at': new Date().toISOString(),
              'user-sub': userSub,
              'processed-by': 'lambda-image-processor',
              'error': 'unsupported-mime'
            }
          };
          await s3Client.send(new PutObjectCommand(putFailureParams));
          console.log(`Wrote processing failure marker: ${failureKey}`);
        } catch (markErr) {
          console.error(`Failed to write processing failure marker for ${key}:`, markErr);
        }

        // 跳过后续处理
        continue;
      }

      // 使用Jimp处理图片 - 餐厅logo标准化为300x300
      const image = await Jimp.read(imageBuffer);
      const processedImageBuffer = await image
        .cover(300, 300) // 裁剪并缩放到300x300，保持宽高比
        .quality(85) // 设置JPEG质量
        .getBufferAsync(Jimp.MIME_JPEG);

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

// 轻量的 buffer 嗅探函数，检查 ftyp box 来识别 AVIF/HEIF 等常见容器
function detectMimeFromBuffer(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

    // 查找 'ftyp' box（通常在 offset 4）
    const ftypIndex = buf.indexOf('ftyp');
    if (ftypIndex === -1) return null;

    // 紧随其后的 4 字节为 major_brand，例如 'avif' 或 'mif1' 等
    const brand = buf.toString('ascii', ftypIndex + 4, ftypIndex + 8).toLowerCase();
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'heic' || brand === 'heix') {
      return 'image/avif';
    }

    return null;
  } catch (e) {
    console.warn('Buffer mime sniff failed:', e);
    return null;
  }
}