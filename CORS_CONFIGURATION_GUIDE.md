# eMenu Backend CORS 配置指南

## 概述
本文档描述了 eMenu-backend 项目中 CORS（跨域资源共享）的正确配置方法，以及如何避免常见的 CORS 问题。

## 当前 CORS 配置

### Lambda Function URL CORS 设置
位置：`infra/main/s3.tf`

```terraform
resource "aws_lambda_function_url" "presigned_url_generator" {
  function_name      = aws_lambda_function.presigned_url_generator.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "HEAD", "PATCH"]
    allow_headers     = [
      "authorization",
      "content-type", 
      "date",
      "keep-alive"
    ]
    expose_headers    = ["date", "keep-alive"]
    max_age          = 86400
  }
}
```

### S3 Bucket CORS 设置
位置：`infra/main/s3.tf`

```terraform
resource "aws_s3_bucket_cors_configuration" "restaurant_assets_cors" {
  bucket = aws_s3_bucket.restaurant_assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}
```

## 重要原则

### 1. 单一 CORS 配置源
**✅ 正确做法**: 仅在基础设施层（Terraform）配置 CORS
**❌ 错误做法**: 同时在基础设施和应用代码中配置 CORS

### 2. Lambda Function URL 限制
- HTTP 方法名不能超过 6 个字符
- 因此使用 "PATCH" 而不是 "OPTIONS"
- OPTIONS 请求由 AWS 自动处理

### 3. 环境一致性
所有环境（开发、测试、生产）使用相同的 CORS 配置，通过 Terraform 变量控制差异。

## API 端点

### Presigned URL Generator
```
URL: https://zbrgpwvql2clauytszsysqygz40rcpiq.lambda-url.ap-southeast-2.on.aws/
方法: POST
认证: JWT Token (在 Authorization header 中)
```

### S3 资产存储
```
Bucket: emenu-restaurant-assets-dev
区域: ap-southeast-2
访问: 公开读取，通过 presigned URL 写入
```

## 前端集成

### JavaScript/TypeScript 示例
```javascript
// 正确的 API 调用示例
const response = await fetch('https://zbrgpwvql2clauytszsysqygz40rcpiq.lambda-url.ap-southeast-2.on.aws/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    fileName: 'image.jpg',
    fileType: 'image/jpeg'
  })
});

if (response.ok) {
  const data = await response.json();
  console.log('Presigned URL:', data.uploadUrl);
} else {
  console.error('Error:', response.status);
}
```

### React 示例
```jsx
import { useState } from 'react';

function ImageUpload({ authToken }) {
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file) => {
    setUploading(true);
    
    try {
      // 1. 获取 presigned URL
      const presignedResponse = await fetch(
        'https://zbrgpwvql2clauytszsysqygz40rcpiq.lambda-url.ap-southeast-2.on.aws/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type
          })
        }
      );

      if (!presignedResponse.ok) {
        throw new Error('Failed to get presigned URL');
      }

      const { uploadUrl } = await presignedResponse.json();

      // 2. 上传文件到 S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      console.log('File uploaded successfully');
      
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <input 
      type="file" 
      onChange={(e) => uploadImage(e.target.files[0])}
      disabled={uploading}
    />
  );
}
```

## 故障排除

### 常见 CORS 错误

1. **重复的 Access-Control-Allow-Origin 头**
   - 原因：同时在基础设施和应用代码中设置 CORS
   - 解决：仅在 Terraform 中配置 CORS

2. **Method not allowed**
   - 检查请求的 HTTP 方法是否在 `allow_methods` 中
   - 确保方法名不超过 6 个字符

3. **Header not allowed**
   - 检查请求的头是否在 `allow_headers` 中
   - 添加缺失的头到 Terraform 配置

### 测试 CORS 配置
```bash
# 测试 OPTIONS 预检请求
curl -X OPTIONS https://zbrgpwvql2clauytszsysqygz40rcpiq.lambda-url.ap-southeast-2.on.aws/ \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v

# 测试实际 POST 请求
curl -X POST https://zbrgpwvql2clauytszsysqygz40rcpiq.lambda-url.ap-southeast-2.on.aws/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"fileName": "test.jpg", "fileType": "image/jpeg"}' \
  -v
```

## 部署

### 应用 CORS 更改
```bash
cd infra/main
terraform plan
terraform apply
```

### 验证部署
```bash
# 获取 Lambda URL
terraform output presigned_url_generator_url

# 测试 CORS
curl -I -X OPTIONS [LAMBDA_URL]
```

## 安全考虑

### 生产环境建议
1. **限制 Origins**: 将 `allow_origins` 从 `["*"]` 改为具体的域名
2. **HTTPS Only**: 确保所有请求都通过 HTTPS
3. **JWT 验证**: 保持 Lambda 函数中的 JWT 验证逻辑

### 示例生产配置
```terraform
cors {
  allow_credentials = false
  allow_origins     = [
    "https://yourdomain.com",
    "https://app.yourdomain.com"
  ]
  allow_methods     = ["GET", "POST", "PUT", "DELETE", "HEAD"]
  allow_headers     = ["authorization", "content-type"]
  expose_headers    = ["date"]
  max_age          = 86400
}
```

## 联系信息
如有 CORS 相关问题，请联系后端团队或在项目 issue 中提出。