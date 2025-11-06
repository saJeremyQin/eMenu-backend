# 渐进式重构完成 - 部署前检查清单

## ✅ 已完成的工作

### 1. 模块化目录结构创建 ✅
- `/config` - 配置常量和 AWS 客户端
- `/utils` - 可复用工具函数
- `/resolvers` - GraphQL resolvers
- `/middleware` - 中间件（预留）

### 2. 配置文件 ✅
- `config/constants.js` - SUBSCRIPTION_LIMITS, INVITE_TOKEN_TTL_HOURS
- `config/aws-clients.js` - cognitoClient, sesClient, ssmClient

### 3. 工具函数 ✅
- `utils/db.js` - connectDb() 数据库连接
- `utils/auth.js` - getRestaurantIdFromIdentity, getUserRole, requireRole, requireBoss, requireBossOrWaiter, isBoss
- `utils/email.js` - sendInviteEmail()
- `utils/token.js` - generateInviteToken(), isInviteTokenExpired()
- `utils/subscription-limits.js` - checkDishTypeLimit(), checkDishLimit(), checkWaiterLimit()

### 4. DishType Resolvers ✅
**文件**: `resolvers/dishType.js`
- Query: `listDishTypes`
- Mutation: `createDishType`, `updateDishType`, `deleteDishType`

**功能特性**:
- Boss 权限验证
- 订阅限制检查
- 软删除支持
- 自动 sortOrder 管理

### 5. Dish Resolvers ✅
**文件**: `resolvers/dish.js`
- Query: `listDishes` (支持 dishTypeId 过滤)
- Mutation: `createDish`, `updateDish`, `deleteDish`, `updateDishAvailability`
- Field Resolver: `Dish.dishType` (填充完整的 DishType 对象)

**功能特性**:
- Boss 权限验证
- 订阅限制检查
- DishType 验证（确保属于当前餐厅）
- 软删除支持
- 自动 sortOrder 管理（按分类）

### 6. Resolver 聚合 ✅
**文件**: `resolvers/index.js`
- 导出统一的 `resolvers` 对象
- 包含 Query, Mutation, Field Resolvers

### 7. Handler 集成 ✅
**文件**: `index.mjs` (更新)
- 导入新的模块化 resolvers
- 更新 switch case 路由到新 resolvers
- 保留旧函数作为参考（已标记为 LEGACY）

---

## 📋 部署前检查清单

### A. 代码检查
- [ ] 所有新文件使用 ES6 模块语法 (`import/export`)
- [ ] 所有导入路径正确（相对路径 `./` 或 `../`）
- [ ] 所有 async 函数正确使用 `await`
- [ ] 错误处理完整（try-catch 或 throw）

### B. 依赖检查
- [ ] 确认 package.json 包含所有依赖
  - mongoose
  - @aws-sdk/client-cognito-identity-provider
  - @aws-sdk/client-ses
  - @aws-sdk/client-ssm
- [ ] 确认 Lambda Layer 包含 models
  - /opt/nodejs/models/restaurant.js
  - /opt/nodejs/models/user.js
  - /opt/nodejs/models/dish.js
  - /opt/nodejs/models/dishType.js

### C. GraphQL Schema 检查
- [ ] infra/main/schema.graphql 已更新
  - DishType 类型定义 ✅
  - Dish 类型定义 ✅
  - Dish.dishType: DishType! field ✅
  - Input types 包含必要字段 ✅
- [ ] 部署 Terraform 更新 AppSync schema

### D. 数据库模型检查
- [ ] DishType model 已更新（isActive, sortOrder, 索引）✅
- [ ] Dish model 已更新（sortOrder, 优化索引）✅

### E. 环境变量检查
- [ ] Lambda 环境变量包含 `DB_PARAM_NAME`
- [ ] SSM Parameter Store 包含数据库连接字符串

### F. 权限检查
- [ ] Lambda execution role 有权限访问 SSM
- [ ] Lambda execution role 有权限发送 SES 邮件
- [ ] Lambda execution role 有权限调用 Cognito

---

## 🚀 部署步骤

### 1. 部署后端代码
```bash
cd /Users/nicolezhang/Desktop/eMenu/eMenu-backend
./deploy.sh
```

### 2. 测试 API（使用 AppSync Console 或 Postman）

#### Test 1: listDishTypes (Query)
```graphql
query ListDishTypes {
  listDishTypes {
    id
    name
    alias
    sortOrder
    isActive
    isDeleted
  }
}
```

#### Test 2: createDishType (Mutation)
```graphql
mutation CreateDishType {
  createDishType(
    name: "主食"
    alias: "Staples"
    sortOrder: 0
    isActive: true
  ) {
    id
    name
    alias
    sortOrder
    isActive
  }
}
```

#### Test 3: listDishes with Field Resolver
```graphql
query ListDishes {
  listDishes {
    id
    name
    price
    sortOrder
    isAvailable
    dishType {
      id
      name
      alias
    }
  }
}
```

#### Test 4: createDish (Mutation)
```graphql
mutation CreateDish {
  createDish(input: {
    dishTypeId: "DISHTYPE_ID_HERE"
    name: "红烧牛肉面"
    price: 15.50
    description: "经典川味"
    isAvailable: true
  }) {
    id
    name
    price
    dishType {
      name
    }
  }
}
```

### 3. 验证功能
- [ ] 创建菜品分类成功
- [ ] 列出菜品分类成功
- [ ] 更新菜品分类成功
- [ ] 删除菜品分类成功（软删除）
- [ ] 创建菜品成功
- [ ] 列出菜品成功（包含 dishType 嵌套对象）
- [ ] 更新菜品成功
- [ ] 删除菜品成功（软删除）
- [ ] 更新菜品上架状态成功
- [ ] 订阅限制验证生效
- [ ] Boss 权限验证生效

### 4. 监控和日志
- [ ] 检查 CloudWatch Logs 无错误
- [ ] 验证 MongoDB 连接成功
- [ ] 检查 SSM 参数读取成功

---

## 🔄 回滚计划

如果新的模块化 resolvers 出现问题：

### 快速回滚到旧实现
1. 打开 `index.mjs`
2. 在 handler switch case 中，将:
   ```javascript
   case "listDishTypes":
     return await newResolvers.Query.listDishTypes(event.arguments, identity);
   ```
   改回:
   ```javascript
   case "listDishTypes":
     return await listDishTypes(event.arguments, identity);
   ```
3. 重新部署

### 完整回滚
如果需要完全回滚，使用 git:
```bash
git checkout HEAD~1 lambdas/emenu_server/
```

---

## 📊 性能基准

建议记录以下指标对比（新 vs 旧实现）:
- Lambda 执行时间
- 冷启动时间
- 内存使用
- 错误率

---

## 🎯 下一步计划

1. **验证生产环境稳定性** (1-2 周)
2. **删除旧的 dish 相关函数** (index.mjs 中标记为 LEGACY 的部分)
3. **迁移下一个模块**:
   - 推荐顺序: Restaurant → User → Waiter → Order
4. **编写单元测试**:
   - 为新的 resolvers 编写 Vitest 测试
5. **文档更新**:
   - 更新 API 文档
   - 更新开发者指南

---

## 📝 备注

- 所有旧函数保留在 `index.mjs` 中作为参考
- 新的模块化结构提高了代码可维护性和可测试性
- 渐进式迁移降低了风险，现有功能不受影响
- 详细的重构进度见 `REFACTORING_PROGRESS.md`
