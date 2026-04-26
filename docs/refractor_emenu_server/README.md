# eMenu Server - 模块化架构指南

## 🎉 渐进式重构完成

eMenu 后端 Lambda 已成功重构为模块化架构，提升了代码可维护性、可测试性和可扩展性。

---

## 📂 目录结构

```
lambdas/emenu_server/
│
├── 📄 index.mjs                    # Lambda 入口（Handler + 路由）
├── 📄 package.json                 # 依赖配置
│
├── 📁 config/                      # 配置管理
│   ├── constants.js                # 业务常量（订阅限制、令牌策略）
│   └── aws-clients.js              # AWS SDK 客户端（Cognito, SES, SSM）
│
├── 📁 utils/                       # 工具函数
│   ├── db.js                       # 数据库连接（MongoDB + SSM）
│   ├── auth.js                     # 认证授权（RBAC 辅助函数）
│   ├── email.js                    # 邮件发送（SES）
│   ├── token.js                    # 令牌生成和验证
│   └── subscription-limits.js      # 订阅限制检查
│
├── 📁 resolvers/                   # GraphQL Resolvers
│   ├── dishType.js                 # 菜品分类 CRUD
│   ├── dish.js                     # 菜品 CRUD + Field Resolver
│   └── index.js                    # Resolver 聚合导出
│
├── 📁 middleware/                  # 中间件（预留）
│
└── 📄 文档/
    ├── REFACTORING_SUMMARY.md      # 重构总结（推荐先读）
    ├── REFACTORING_PROGRESS.md     # 重构进度追踪
    └── DEPLOYMENT_CHECKLIST.md     # 部署前检查清单
```

---

## 🚀 快速开始

### 1. 查看重构总结
```bash
cat REFACTORING_SUMMARY.md
```
了解重构前后的对比、新功能、性能优化等。

### 2. 检查部署清单
```bash
cat DEPLOYMENT_CHECKLIST.md
```
确保所有依赖、环境变量、权限配置正确。

### 3. 部署到 AWS
```bash
./deploy.sh
```

### 4. 测试 GraphQL API
使用 AppSync Console 或 Postman 测试新的 DishType 和 Dish resolvers。

---

## 📖 使用指南

### 添加新的 Resolver

#### 1. 创建 Resolver 文件
```javascript
// resolvers/restaurant.js
import Restaurant from '/opt/nodejs/models/restaurant.js';
import { getRestaurantIdFromIdentity, requireBoss } from '../utils/auth.js';

export async function getRestaurant(args, identity) {
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const restaurant = await Restaurant.findById(restaurantId);
  return restaurant;
}

export async function updateRestaurant(args, identity) {
  await requireBoss(identity);
  // 实现更新逻辑
}
```

#### 2. 更新 resolvers/index.js
```javascript
import * as restaurantResolvers from './restaurant.js';

const Query = {
  getRestaurant: restaurantResolvers.getRestaurant,
  // ... 其他 queries
};

const Mutation = {
  updateRestaurant: restaurantResolvers.updateRestaurant,
  // ... 其他 mutations
};
```

#### 3. 更新 index.mjs Handler
```javascript
switch (field) {
  case "getRestaurant":
    return await newResolvers.Query.getRestaurant(event.arguments, identity);
  // ...
}
```

### 添加新的工具函数

```javascript
// utils/validation.js
export function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function validatePrice(price) {
  return price > 0 && price < 10000;
}
```

### 添加新的配置常量

```javascript
// config/constants.js
export const MAX_IMAGE_SIZE_MB = 5;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
```

---

## 🧪 测试

### GraphQL Query 示例

#### 1. 列出菜品分类
```graphql
query ListDishTypes {
  listDishTypes {
    id
    name
    alias
    sortOrder
    isActive
  }
}
```

#### 2. 创建菜品
```graphql
mutation CreateDish {
  createDish(input: {
    dishTypeId: "675a1234567890abcdef1234"
    name: "红烧牛肉面"
    price: 15.50
    description: "经典川味"
  isActive: true
  }) {
    id
    name
    price
    dishType {
      name
      alias
    }
  }
}
```

#### 3. 列出菜品（含分类信息）
```graphql
query ListDishes($dishTypeId: ID) {
  listDishes(dishTypeId: $dishTypeId) {
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

### 单元测试示例（Future）

```javascript
// resolvers/dishType.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDishType } from './dishType.js';

vi.mock('../utils/auth.js');
vi.mock('../utils/subscription-limits.js');

describe('createDishType', () => {
  it('should create dish type with auto sortOrder', async () => {
    const args = { name: '主食', alias: 'Staples' };
    const identity = { sub: 'boss-123' };
    
    const result = await createDishType(args, identity);
    
    expect(result.name).toBe('主食');
    expect(result.sortOrder).toBeGreaterThanOrEqual(0);
  });
});
```

---

## 🔒 权限控制

### 角色定义
- **boss**: 餐厅老板，拥有所有权限
- **waiter**: 服务员，只读权限（部分资源）

### 权限辅助函数

```javascript
import { requireBoss, requireBossOrWaiter, isBoss } from '../utils/auth.js';

// 仅 boss 可执行
await requireBoss(identity);

// boss 或 waiter 可执行
await requireBossOrWaiter(identity);

// 检查是否为 boss
const isBossUser = await isBoss(identity);
if (isBossUser) {
  // boss 专属逻辑
}
```

### 数据隔离

所有查询自动过滤到当前用户的餐厅：
```javascript
const restaurantId = await getRestaurantIdFromIdentity(identity);
const dishes = await Dish.find({ 
  restaurantId, 
  isDeleted: false 
});
```

---

## 📊 订阅限制

### 检查限制

```javascript
import { checkDishTypeLimit, checkDishLimit, checkWaiterLimit } from '../utils/subscription-limits.js';

// 创建前检查限制
await checkDishTypeLimit(restaurantId);  // 抛出错误如果超限
const dish = new DishType({ ... });
await dish.save();
```

### 限制配置

```javascript
// config/constants.js
export const SUBSCRIPTION_LIMITS = {
  FREE: {
    dishTypes: 2,
    dishes: 10,
    waiters: 1,
    tables: 20
  },
  PRO: {
    dishTypes: 20,
    dishes: 200,
    waiters: 20,
    tables: 100
  }
};
```

---

## 🛠️ 故障排查

### 常见问题

#### 1. 导入路径错误
```javascript
// ❌ 错误
import { requireBoss } from 'utils/auth.js';

// ✅ 正确
import { requireBoss } from '../utils/auth.js';
```

#### 2. SSM 参数未设置
```bash
# 检查环境变量
echo $DB_PARAM_NAME

# 在 AWS Console 检查 SSM Parameter Store
# Parameter Name: /emenu/dev/mongodb-uri
```

#### 3. Lambda Layer 未包含 models
```bash
# 确认 Layer 包含以下路径
/opt/nodejs/models/restaurant.js
/opt/nodejs/models/user.js
/opt/nodejs/models/dish.js
/opt/nodejs/models/dishType.js
```

### 日志调试

在 resolvers 中添加详细日志：
```javascript
export async function createDish(args, identity) {
  console.log('createDish args:', JSON.stringify(args, null, 2));
  console.log('createDish identity:', identity.sub);
  
  try {
    // 业务逻辑
  } catch (error) {
    console.error('createDish error:', error);
    throw error;
  }
}
```

查看 CloudWatch Logs：
```bash
aws logs tail /aws/lambda/emenu-server --follow
```

---

## 📈 性能优化

### 1. 数据库索引
确保 models 中定义了复合索引：
```javascript
// models/dish.js
dishSchema.index({ restaurantId: 1, dishTypeId: 1, isDeleted: 1, sortOrder: 1 });
```

### 2. SSM 参数缓存
数据库连接字符串已缓存，避免重复调用 SSM：
```javascript
let cachedDbUri = null;  // utils/db.js
```

### 3. 按需加载（Field Resolver）
只在 GraphQL 查询请求时才填充嵌套对象：
```graphql
# 不需要 dishType 信息时，不会查询
query {
  listDishes {
    id
    name
  }
}

# 需要时才查询
query {
  listDishes {
    id
    name
    dishType { name }  # 触发 Field Resolver
  }
}
```

---

## 🔄 迁移计划

### 已完成 ✅
- DishType Resolvers (4 个)
- Dish Resolvers (5 个)
- Field Resolver (Dish.dishType)

### 待迁移
1. **Restaurant** (4 resolvers) - 预计 1 周
2. **User** (2 resolvers) - 预计 3 天
3. **Waiter** (4 resolvers) - 预计 1 周
4. **Order** (4 resolvers) - 预计 1 周

### 最终目标
- index.mjs: ~800 lines (纯路由层)
- 所有业务逻辑模块化
- 100% 单元测试覆盖

---

## 📚 相关文档

- [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) - 重构总结（推荐阅读）
- [REFACTORING_PROGRESS.md](./REFACTORING_PROGRESS.md) - 进度追踪
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - 部署清单

---

## 🤝 贡献指南

### 添加新功能
1. 在对应模块添加 resolver 函数
2. 更新 resolvers/index.js 聚合
3. 更新 index.mjs handler 路由
4. 编写测试用例
5. 更新文档

### 代码规范
- 使用 ES6 模块语法 (import/export)
- 所有异步函数使用 async/await
- 完整的错误处理（try-catch 或 throw）
- 详细的日志记录
- 清晰的注释说明

---

## ✨ 重构成果

- ✅ 代码行数: 1405 lines → 10 个模块化文件
- ✅ 职责分离: 配置、工具、业务逻辑清晰
- ✅ 可测试性: 每个模块可独立测试
- ✅ 可维护性: 新功能添加更简单
- ✅ 风险控制: 渐进式迁移，现有功能不受影响

**下一步**: 部署测试，验证稳定后继续迁移其他模块！🚀
