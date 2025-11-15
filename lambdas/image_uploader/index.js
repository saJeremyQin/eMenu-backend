// Shared helper to build S3 raw/processed keys for different image types
export function buildS3AndProcessedKeys({ imageType = 'restaurant-logo', userSub, uniqueFileName, fileId }) {
  // uniqueFileName 包含扩展名（例如 uuid.png）。
  // 处理器会把图片统一转换为 JPEG，所以我们把 processed 文件名的扩展名规范为 .jpg。
  const processedName = (uniqueFileName || `${fileId}`).replace(/\.[^/.]+$/, '.jpg');

  if (imageType === 'dish-image') {
    return {
      s3Key: `public/dish-images/${userSub}/raw/${uniqueFileName}`,
      expectedProcessedKey: `public/dish-images/${userSub}/processed/${processedName}`
    };
  }

  // 默认到 restaurant logos
  return {
    s3Key: `public/restaurant-logos/${userSub}/raw/${uniqueFileName}`,
    expectedProcessedKey: `public/restaurant-logos/${userSub}/processed/${processedName}`
  };
}

export default buildS3AndProcessedKeys;
