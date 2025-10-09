# eMenu Backend Documentation

> 📚 **eMenu 后端系统技术文档索引**  
> 本目录包含 eMenu 后端系统的所有技术文档，包括实现总结、配置指南和迁移记录。

## 📋 文档目录

### 🚀 项目实现与迁移

| 文档 | 描述 | 更新日期 |
|------|------|----------|
| [**MIGRATION_SUCCESS.md**](./MIGRATION_SUCCESS.md) | Lambda 函数迁移成功记录<br/>包含从 eMenu-admin 到 eMenu-backend 的完整迁移过程 | 2025-10-06 |
| [**SHARP_TO_JIMP_MIGRATION.md**](./SHARP_TO_JIMP_MIGRATION.md) | Sharp 到 Jimp 图像处理库迁移文档<br/>详细记录了解决 Lambda 二进制兼容性问题的完整过程 | 2025-10-09 |

### ⚙️ 系统实现与配置

| 文档 | 描述 | 更新日期 |
|------|------|----------|
| [**IMPLEMENTATION_SUMMARY.md**](./IMPLEMENTATION_SUMMARY.md) | Lambda 函数实现总结<br/>GraphQL Resolvers 的详细实现说明 | - |
| [**RESOLVER_IMPLEMENTATION_SUMMARY.md**](./RESOLVER_IMPLEMENTATION_SUMMARY.md) | GraphQL Resolver 实现总结<br/>完整的餐厅管理功能实现文档 | - |
| [**CORS_CONFIGURATION_GUIDE.md**](./CORS_CONFIGURATION_GUIDE.md) | CORS 跨域配置指南<br/>详细的 CORS 配置方法和故障排除 | - |

---

## 🏗️ 系统架构概览

### 当前技术栈
- **Runtime**: Node.js 20.x
- **图像处理**: Jimp (纯 JavaScript)
- **AWS 服务**: Lambda, S3, AppSync, Cognito
- **基础设施**: Terraform
- **认证**: JWT (Cognito User Pool)

### 核心组件

#### 🔧 Lambda 函数
- **emenu-server**: AppSync GraphQL resolvers
- **emenu-image-processor**: 自动图像处理和优化
- **emenu-presigned-url-generator**: 安全文件上传 URL 生成
- **emenu-post-confirmation**: Cognito 用户注册后处理

#### 🗄️ 数据存储
- **S3**: 餐厅资源文件存储
- **MongoDB**: 业务数据存储 (通过 Mongoose ODM)

#### 🔗 API
- **AppSync**: GraphQL API 网关
- **Lambda Function URLs**: 直接 HTTP 访问

---

## 📖 快速导航

### 🔍 按用途查找文档

**新开发者入门**
1. 先阅读 [MIGRATION_SUCCESS.md](./MIGRATION_SUCCESS.md) 了解系统迁移历史
2. 查看 [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) 了解核心功能
3. 参考 [CORS_CONFIGURATION_GUIDE.md](./CORS_CONFIGURATION_GUIDE.md) 配置开发环境

**故障排除**
- CORS 问题 → [CORS_CONFIGURATION_GUIDE.md](./CORS_CONFIGURATION_GUIDE.md)
- 图像处理问题 → [SHARP_TO_JIMP_MIGRATION.md](./SHARP_TO_JIMP_MIGRATION.md)
- Lambda 部署问题 → [MIGRATION_SUCCESS.md](./MIGRATION_SUCCESS.md)

**功能开发**
- GraphQL 开发 → [RESOLVER_IMPLEMENTATION_SUMMARY.md](./RESOLVER_IMPLEMENTATION_SUMMARY.md)
- Lambda 函数开发 → [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)

---

## 🗂️ 项目结构

```
eMenu-backend/
├── docs/                    # 📚 技术文档 (当前目录)
├── infra/                   # 🏗️ Terraform 基础设施代码
│   ├── bootstrap/           # 🚀 初始化资源
│   └── main/               # 🏢 主要基础设施
├── lambdas/                # ⚡ Lambda 函数
│   ├── emenu_server/       # 🍽️ AppSync GraphQL 处理器
│   ├── image_processor/    # 🖼️ 图像处理 (Jimp)
│   ├── presigned_url_generator/ # 🔐 文件上传 URL 生成
│   ├── emenu_post_confirmation/ # 👤 用户注册后处理
│   └── layers/             # 📦 Lambda 层 (common_models)
└── .github/                # 🤖 GitHub Actions 工作流
```

---

## 📝 文档维护指南

### 文档更新规则
1. **所有技术文档**必须放在 `docs/` 目录下
2. **迁移和重大变更**需要创建专门的记录文档
3. **配置指南**应包含完整的故障排除步骤
4. **实现总结**要包含代码示例和架构说明

### 文档命名规范
- `*_GUIDE.md` - 配置和使用指南
- `*_SUMMARY.md` - 实现和功能总结  
- `*_MIGRATION.md` - 迁移和变更记录
- `*_SUCCESS.md` - 成功案例和里程碑

---

## 🎯 最近更新

### 2025-10-09: Sharp 到 Jimp 迁移
- ✅ 完成图像处理库从 Sharp 迁移到 Jimp
- ✅ 解决 Lambda 二进制兼容性问题
- ✅ 清理相关构建脚本和测试文件
- ✅ 更新 Terraform 配置和文档

### 2025-10-06: Lambda 迁移成功
- ✅ 成功迁移所有 Lambda 函数到新架构
- ✅ 建立 S3 自动图像处理流程
- ✅ 配置完整的 CORS 支持

---

## 📧 支持与反馈

如有文档问题或需要补充，请：
1. 检查现有文档是否已覆盖相关内容
2. 查看最近的迁移和更新记录
3. 参考对应的配置指南和故障排除步骤

**记住**: 保持文档更新，让知识传承变得简单！ 🚀