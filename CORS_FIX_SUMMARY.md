# CORS 重复头问题修复总结

## 问题描述
前端应用在调用 Lambda URL 时遇到 CORS 错误：
```
The 'Access-Control-Allow-Origin' header contains multiple values '*, *'
```

## 根本原因
CORS 头在两个地方同时被设置，导致重复：

1. **基础设施层面**: Terraform 配置的 Lambda Function URL CORS 设置
2. **应用层面**: Lambda 函数代码中手动添加的 CORS 响应头

## 解决方案

### 1. 移除应用层面的 CORS 头
从 `lambdas/presigned_url_generator/index.js` 中移除了所有 CORS 响应头：

- 删除了 `corsHeaders` 常量定义
- 从所有响应对象中移除了 `headers: corsHeaders` 属性
- 保留了 OPTIONS 请求的处理逻辑，但不添加额外的头

### 2. 修正基础设施层面的 CORS 配置
在 `infra/main/s3.tf` 中更新了 Lambda Function URL 的 CORS 配置：

```terraform
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
```

**注意**: AWS Lambda Function URL 的 `allow_methods` 中每个方法名不能超过 6 个字符，所以使用 "PATCH" 而不是 "OPTIONS"。

## 测试结果

### 修复前
```
access-control-allow-origin: *, *  # 重复的头
```

### 修复后
```
Access-Control-Allow-Origin: *                                    # 单一头
Access-Control-Allow-Headers: authorization,content-type,date,keep-alive
Access-Control-Allow-Methods: POST,GET,HEAD,PATCH,DELETE,PUT
Access-Control-Max-Age: 86400
```

## 关键学习点

1. **单一 CORS 配置**: 使用 Lambda Function URL 时，应该仅在基础设施层配置 CORS，而不是在应用代码中
2. **方法名长度限制**: AWS Lambda Function URL 的 CORS 配置对 HTTP 方法名有 6 字符的限制
3. **预检请求**: OPTIONS 请求由 AWS 基础设施自动处理，无需在 Lambda 代码中特殊处理

## 部署状态
- ✅ Lambda 函数已更新
- ✅ Terraform 配置已应用
- ✅ CORS 测试通过
- ✅ 前端可以正常调用 API

## Lambda URL
```
https://zbrgpwvql2clauytszsysqygz40rcpiq.lambda-url.ap-southeast-2.on.aws/
```

现在前端应用可以成功调用此 URL 而不会遇到 CORS 错误。