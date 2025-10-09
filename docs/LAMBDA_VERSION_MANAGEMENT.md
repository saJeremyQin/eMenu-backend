# Lambda 版本管理指南

## 概述

为了避免 CI/CD 过程中不必要的 Lambda 函数重新部署，我们使用静态的 `source_code_hash` 来控制部署。

## 版本控制策略

### 1. Lambda Layer 版本

**当前版本：`20251009-v1`**

- **common_mongoose_models layer**: `20251009-v1`

### 2. Lambda 函数版本

| 函数名 | 当前版本 | 依赖 Layer | 最后更新 |
|--------|----------|------------|----------|
| emenu_server | `20251009-v1-layer1` | common_mongoose_models | 2025-10-09 |
| emenu_post_confirmation | `20251009-v1-layer1` | common_mongoose_models | 2025-10-09 |
| image_processor | `20251009-v1` | 无 | 2025-10-09 |
| presigned_url_generator | `20251009-v1` | 无 | 2025-10-09 |

## 更新规则

### 何时需要更新版本

1. **Layer 版本更新时**：
   - 修改了 `lambdas/layers/common_models/` 中的代码
   - 更新 layer 的 `source_code_hash`
   - 同时更新所有依赖该 layer 的函数版本

2. **函数代码更新时**：
   - 修改了具体函数的代码
   - 只更新该函数的 `source_code_hash`

### 版本号格式

- **Layer**: `YYYYMMDD-v[版本号]`
  - 例如: `20251009-v1`, `20251009-v2`
  
- **依赖 Layer 的函数**: `YYYYMMDD-v[函数版本]-layer[layer版本]`
  - 例如: `20251009-v1-layer1`, `20251009-v2-layer1`
  
- **独立函数**: `YYYYMMDD-v[版本号]`
  - 例如: `20251009-v1`, `20251009-v2`

## 更新流程

### 场景1：更新 common_mongoose_models layer

1. 修改 `lambdas/layers/common_models/` 中的代码
2. 更新 `lambda.tf` 中的版本：
   ```terraform
   # Layer
   source_code_hash = "20251009-v2"  # v1 -> v2
   
   # 依赖的函数也要更新
   source_code_hash = "20251009-v1-layer2"  # layer1 -> layer2
   ```
3. 提交并推送代码

### 场景2：只更新单个函数

1. 修改具体函数的代码
2. 只更新该函数的版本：
   ```terraform
   # 例如更新 image_processor
   source_code_hash = "20251009-v2"  # v1 -> v2
   ```
3. 提交并推送代码

### 场景3：同时更新函数和 layer

1. 修改代码
2. 按顺序更新版本号：
   - Layer 版本 +1
   - 依赖 layer 的函数 layer 版本 +1
   - 修改的函数本身版本 +1

## 自动化脚本（可选）

未来可以创建脚本来自动检测代码变化并更新版本号，但目前我们使用手动管理以确保精确控制。

## 注意事项

1. **团队协作**：确保团队成员了解版本更新规则
2. **一致性**：依赖相同 layer 的函数应该使用相同的 layer 版本号
3. **文档更新**：每次版本更新后，更新此文档的版本表格
4. **测试**：版本更新后，在 dev 环境测试确认无误再部署到 prod

## 故障排除

如果遇到意外的重新部署：
1. 检查 `source_code_hash` 是否被意外修改
2. 确认 GitHub Actions 没有修改 S3 中的文件
3. 检查是否有 Terraform 配置错误