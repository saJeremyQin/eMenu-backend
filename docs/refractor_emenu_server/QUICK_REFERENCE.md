# eMenu 后端重构 - 快速参考卡

## ⚡ 5 分钟了解新架构

### 📂 文件位置
```
config/      → 配置常量和 AWS 客户端
utils/       → 工具函数（数据库、认证、邮件等）
resolvers/   → GraphQL Resolvers（按功能模块）
index.mjs    → Lambda 入口（路由层）
```

### 🎯 核心概念

#### 1. Resolver 路由
```javascript
// 旧方式 (index.mjs 单体)
const createDish = async (args, identity) => { ... }

// 新方式 (模块化)
import { resolvers } from './resolvers/index.js';
case "createDish":
  return await resolvers.Mutation.createDish(args, identity);
```

#### 2. 权限验证
```javascript
import { requireBoss } from '../utils/auth.js';

// 仅 boss 可执行
await requireBoss(identity);
```

#### 3. 订阅限制
```javascript
import { checkDishLimit } from '../utils/subscription-limits.js';

// 创建前检查限制
await checkDishLimit(restaurantId);
```

#### 4. Field Resolver
```javascript
// resolvers/dish.js
export async function resolveDishType(parent) {
  return await DishType.findById(parent.dishTypeId);
}
```

### 📝 GraphQL 测试示例

```graphql
# 创建分类
mutation {
  createDishType(name: "主食") { id name }
}

# 创建菜品（含 Field Resolver）
mutation {
  createDish(input: { 
    dishTypeId: "xxx", 
    name: "面", 
    price: 10 
  }) {
    id
    name
    dishType { name }  # 自动调用 Field Resolver
  }
}

# 列出菜品
query {
  listDishes { 
    id 
    name 
    dishType { name }  # 按需加载
  }
}
```

### 🔐 权限矩阵

| Resolver | Boss | Waiter |
|----------|------|--------|
| listDishTypes | ✅ | ✅ |
| createDishType | ✅ | ❌ |
| updateDishType | ✅ | ❌ |
| deleteDishType | ✅ | ❌ |
| listDishes | ✅ | ✅ |
| createDish | ✅ | ❌ |
| updateDish | ✅ | ❌ |
| deleteDish | ✅ | ❌ |
| updateDishAvailability | ✅ | ❌ |

### 📊 订阅限制

| Plan | DishTypes | Dishes | Waiters |
|------|-----------|--------|---------|
| BASIC | 2 | 10 | 2 |
| PREMIUM | 20 | 200 | 20 |

### 🛠️ 常用工具函数

```javascript
// 认证
import { requireBoss, requireBossOrWaiter, isBoss } from '../utils/auth.js';

// 数据库
import { connectDb } from '../utils/db.js';

// 邮件
import { sendInviteEmail } from '../utils/email.js';

// 令牌
import { generateInviteToken, isInviteTokenExpired } from '../utils/token.js';

// 订阅限制
import { checkDishTypeLimit, checkDishLimit, checkWaiterLimit } from '../utils/subscription-limits.js';

// 配置
import { SUBSCRIPTION_LIMITS, INVITE_TOKEN_TTL_HOURS } from '../config/constants.js';
import { cognitoClient, sesClient, ssmClient } from '../config/aws-clients.js';
```

### 🚀 部署步骤

```bash
# 1. 检查语法
cd lambdas/emenu_server
node --check index.mjs

# 2. 部署
cd /path/to/eMenu-backend
./deploy.sh

# 3. 测试
# 使用 AppSync Console 测试 GraphQL queries/mutations

# 4. 监控
aws logs tail /aws/lambda/emenu-server --follow
```

### 🔄 常见操作

#### 添加新 Resolver
1. 在 `resolvers/` 下创建模块文件 (如 `restaurant.js`)
2. 导出 resolver 函数
3. 在 `resolvers/index.js` 中聚合
4. 在 `index.mjs` handler 中添加路由

#### 添加新工具函数
1. 在 `utils/` 下创建文件 (如 `validation.js`)
2. 导出函数
3. 在 resolver 中导入使用

#### 更新配置常量
1. 编辑 `config/constants.js`
2. 导出新常量
3. 在需要的地方导入

### ⚠️ 注意事项

1. **导入路径**: 使用相对路径 (`../utils/auth.js`)
2. **Lambda Layer**: Models 在 `/opt/nodejs/models/`
3. **环境变量**: `DB_PARAM_NAME` 必须设置
4. **软删除**: 使用 `isDeleted` 字段，不物理删除
5. **数据隔离**: 所有查询自动按 `restaurantId` 过滤

### 📚 文档快速链接

- [README.md](./README.md) - 完整使用指南
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构图和数据流
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - 部署清单
- [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) - 重构总结

### 🐛 故障排查

| 问题 | 解决方案 |
|------|----------|
| 导入错误 | 检查路径是否使用相对路径 (`./` 或 `../`) |
| SSM 参数错误 | 检查 `DB_PARAM_NAME` 环境变量 |
| 权限被拒 | 确认用户角色为 boss |
| 超过限制 | 检查订阅计划 (BASIC/PREMIUM) |
| Field Resolver 未触发 | 确认 GraphQL query 中包含该字段 |

### 💡 最佳实践

1. **权限先行**: 所有 Mutation 先调用权限检查
2. **数据隔离**: 使用 `getRestaurantIdFromIdentity()` 自动过滤
3. **订阅限制**: 创建资源前调用 `check*Limit()`
4. **错误处理**: 使用 `try-catch` 或直接 `throw`
5. **日志记录**: 添加 `console.log` 便于调试

### 🎓 学习路径

1. 阅读 `README.md` 了解整体架构
2. 查看 `resolvers/dish.js` 学习 Resolver 实现
3. 查看 `utils/auth.js` 学习权限验证
4. 阅读 `ARCHITECTURE.md` 理解数据流向
5. 参考 `DEPLOYMENT_CHECKLIST.md` 进行部署

---

**提示**: 这是快速参考卡，详细信息请查看完整文档！
