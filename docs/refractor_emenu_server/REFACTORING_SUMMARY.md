# eMenu Backend - 渐进式重构完成总结

## 📂 新的文件结构

```
lambdas/emenu_server/
├── 📄 index.mjs                        # Lambda handler (1419 lines → 将逐步减少)
├── 📄 package.json                     # 依赖配置
├── 📄 REFACTORING_PROGRESS.md         # 重构进度追踪文档
├── 📄 DEPLOYMENT_CHECKLIST.md         # 部署前检查清单
│
├── 📁 config/                          # ⭐ 新增：配置管理
│   ├── constants.js                    # 订阅限制常量、令牌策略
│   └── aws-clients.js                  # AWS SDK 客户端初始化
│
├── 📁 utils/                           # ⭐ 新增：工具函数
│   ├── db.js                           # 数据库连接（SSM 参数缓存）
│   ├── auth.js                         # 认证授权（RBAC 辅助函数）
│   ├── email.js                        # SES 邮件发送
│   ├── token.js                        # 令牌生成和验证
│   └── subscription-limits.js          # 订阅限制检查
│
├── 📁 resolvers/                       # ⭐ 新增：GraphQL Resolvers
│   ├── dishType.js                     # DishType CRUD
│   ├── dish.js                         # Dish CRUD + Field Resolver
│   └── index.js                        # Resolver 聚合导出
│
└── 📁 middleware/                      # ⭐ 新增：中间件（预留）
```

---

## ✨ 重构亮点

### 1. 职责分离
- **配置层** (config/): 常量和客户端初始化
- **工具层** (utils/): 可复用的业务无关函数
- **业务层** (resolvers/): GraphQL 业务逻辑
- **入口层** (index.mjs): 请求路由和错误处理

### 2. 模块化 Resolvers
**旧结构** (单体):
```javascript
// index.mjs (1405 lines)
const listDishTypes = async (args, identity) => { ... }
const createDishType = async (args, identity) => { ... }
// ... 所有 resolvers 在一个文件
```

**新结构** (模块化):
```javascript
// resolvers/dishType.js
export async function listDishTypes(args, identity) { ... }
export async function createDishType(args, identity) { ... }

// resolvers/index.js
export const resolvers = {
  Query: { listDishTypes, ... },
  Mutation: { createDishType, ... }
}

// index.mjs
import { resolvers as newResolvers } from './resolvers/index.js';
case "listDishTypes":
  return await newResolvers.Query.listDishTypes(event.arguments, identity);
```

### 3. 可测试性提升
每个模块可独立测试，例如:
```javascript
// utils/auth.test.js (future)
import { requireBoss } from '../utils/auth.js';
import { vi, expect, test } from 'vitest';

test('requireBoss throws error for waiter role', async () => {
  const mockIdentity = { sub: 'waiter-123' };
  await expect(requireBoss(mockIdentity)).rejects.toThrow('PERMISSION_DENIED');
});
```

### 4. 渐进式迁移（低风险）
- ✅ 新功能 (DishType, Dish) 使用新结构
- ⏸️ 现有功能 (Restaurant, User, Waiter, Order) 保持不变
- 📊 验证稳定后逐步迁移其他模块

---

## 📊 代码统计

### 文件数量对比
| 类型 | 旧结构 | 新结构 | 变化 |
|------|--------|--------|------|
| 配置文件 | 0 | 2 | +2 |
| 工具函数文件 | 0 | 5 | +5 |
| Resolver 文件 | 0 | 3 | +3 |
| 总计 | 1 (index.mjs) | 10 | +9 |

### 代码行数分布 (新增代码)
| 文件 | 行数 | 说明 |
|------|------|------|
| config/constants.js | 27 | 订阅限制和令牌策略 |
| config/aws-clients.js | 14 | AWS 客户端初始化 |
| utils/db.js | 56 | 数据库连接 |
| utils/auth.js | 86 | 认证授权工具 |
| utils/email.js | 30 | 邮件发送 |
| utils/token.js | 31 | 令牌工具 |
| utils/subscription-limits.js | 85 | 订阅限制检查 |
| resolvers/dishType.js | 122 | DishType CRUD |
| resolvers/dish.js | 183 | Dish CRUD + Field Resolver |
| resolvers/index.js | 61 | Resolver 聚合 |
| **总计** | **~695 lines** | **新增模块化代码** |

### index.mjs 变化
- **旧**: 1405 lines (所有逻辑在一个文件)
- **新**: 1419 lines (暂时保留旧函数作为参考)
- **未来**: 预计减少到 ~800 lines (删除旧 dish 函数后)

---

## 🎯 已实现的功能

### DishType Management (菜品分类管理)
| 功能 | Resolver | 权限 | 订阅限制 |
|------|----------|------|----------|
| 列出分类 | listDishTypes | ✅ Boss/Waiter | - |
| 创建分类 | createDishType | ✅ Boss Only | ✅ 检查 |
| 更新分类 | updateDishType | ✅ Boss Only | - |
| 删除分类 | deleteDishType | ✅ Boss Only | - |

**特性**:
- 软删除 (isDeleted=true, isActive=false)
- 自动 sortOrder 管理
- 按 sortOrder 排序

### Dish Management (菜品管理)
| 功能 | Resolver | 权限 | 订阅限制 |
|------|----------|------|----------|
| 列出菜品 | listDishes | ✅ Boss/Waiter | - |
| 创建菜品 | createDish | ✅ Boss Only | ✅ 检查 |
| 更新菜品 | updateDish | ✅ Boss Only | - |
| 删除菜品 | deleteDish | ✅ Boss Only | - |
| 上架/下架 | toggleDishStatus | ✅ Boss Only | - |
| 获取分类信息 | Dish.dishType (Field Resolver) | ✅ | - |

**特性**:
- 软删除 (isDeleted=true, isActive=false)
- DishType 归属验证（防止跨餐厅引用）
- 自动 sortOrder 管理（按分类）
- 支持 dishTypeId 过滤
- Field Resolver 填充完整的 DishType 对象

---

## 🔒 安全性增强

### 1. 权限验证
所有 Mutation 操作都经过严格的角色检查:
```javascript
await requireBoss(identity);  // 仅 boss 可执行
```

### 2. 数据隔离
所有查询自动过滤到当前用户的餐厅:
```javascript
const restaurantId = await getRestaurantIdFromIdentity(identity);
const dishes = await Dish.find({ restaurantId, isDeleted: false });
```

### 3. DishType 归属验证
创建菜品时验证 dishTypeId 属于当前餐厅:
```javascript
const dishType = await DishType.findOne({
  _id: dishTypeId,
  restaurantId,
  isDeleted: false
});
if (!dishType) throw new Error('Invalid dish type');
```

---

## 📈 性能优化

### 1. 数据库连接缓存
```javascript
let cachedDbUri = null;  // SSM 参数缓存，避免重复调用
```

### 2. 索引优化
DishType:
```javascript
{ restaurantId: 1, isDeleted: 1, sortOrder: 1 }  // 复合索引
```

Dish:
```javascript
{ restaurantId: 1, dishTypeId: 1, isDeleted: 1, sortOrder: 1 }
{ dishTypeId: 1, isDeleted: 1, isActive: 1, sortOrder: 1 }
```

### 3. Field Resolver 按需加载
```graphql
query ListDishes {
  listDishes {
    id
    name
    dishType {  # 仅在查询时加载，不影响性能
      name
    }
  }
}
```

---

## 🧪 测试建议

### 单元测试 (Vitest)
```javascript
// resolvers/dishType.test.js
import { createDishType } from './dishType.js';
import { vi } from 'vitest';

vi.mock('../utils/auth.js');
vi.mock('../utils/subscription-limits.js');

test('createDishType validates boss role', async () => {
  // 测试权限验证
});

test('createDishType checks subscription limit', async () => {
  // 测试订阅限制
});
```

### 集成测试 (GraphQL)
使用 AppSync Console 或 Postman 测试完整流程:
1. 创建分类 → 创建菜品 → 列出菜品（含 dishType）
2. 更新菜品 → 删除菜品 → 验证软删除
3. 测试订阅限制 → 测试权限验证

---

## 🚀 部署建议

### 1. 分阶段部署
- **Stage 1**: 部署到 dev 环境测试
- **Stage 2**: 小范围用户 beta 测试
- **Stage 3**: 全量部署到 prod

### 2. 监控指标
- Lambda 执行时间 (目标: < 3s)
- 错误率 (目标: < 0.1%)
- 内存使用 (目标: < 256MB)

### 3. 回滚准备
保留旧函数作为备份，可快速切换回旧实现

---

## 📝 后续计划

### Phase 2: 迁移 Restaurant Resolvers
- 预计时间: 1 周
- 文件: resolvers/restaurant.js
- Resolvers: getRestaurant, createRestaurant, updateRestaurantInfo, updateRestaurantSubscriptionPlan

### Phase 3: 迁移 User & Waiter Resolvers
- 预计时间: 1 周
- 文件: resolvers/user.js, resolvers/waiter.js
- Resolvers: getUser, getUserByCognito, listWaiters, inviteWaiter, registerWaiter, deleteWaiter

### Phase 4: 迁移 Order Resolvers
- 预计时间: 1 周
- 文件: resolvers/order.js
- Resolvers: listOrders, placeOrder, checkoutOrder, updateOrderStatus

### Phase 5: 清理和优化
- 删除旧函数（index.mjs 中标记为 LEGACY 的部分）
- 编写单元测试
- 性能优化
- 文档完善

---

## 🎓 学习要点

1. **渐进式重构**: 不要一次性重写所有代码，逐步迁移降低风险
2. **模块化设计**: 按功能领域分离代码（config, utils, resolvers）
3. **测试驱动**: 新代码应该更容易测试
4. **保持向后兼容**: 保留旧代码作为备份
5. **文档先行**: 写好文档再编码，确保团队理解

---

## ✅ 成果总结

### 代码质量
- ✅ 模块化架构
- ✅ 职责分离清晰
- ✅ 可测试性提升
- ✅ 代码复用性提升

### 业务价值
- ✅ 新功能 (DishType, Dish) 完整实现
- ✅ 订阅限制生效
- ✅ 权限控制严格
- ✅ 软删除保护数据

### 技术债务
- ⬇️ index.mjs 行数将逐步减少
- ⬇️ 代码重复大幅降低
- ⬇️ 维护成本降低

**重构前**: 1405 lines 单体文件  
**重构后**: 10 个模块化文件，职责清晰  
**下一步**: 继续迁移其他模块，最终将 index.mjs 简化为纯路由层
