# 渐进式重构说明

## 已完成的模块化迁移

### DishType & Dish Resolvers (✅ 已迁移)

以下 resolver 已迁移到模块化结构：

**Query:**
- `listDishTypes` → `resolvers/dishType.js`
- `listDishes` → `resolvers/dish.js`

**Mutation:**
- `createDishType` → `resolvers/dishType.js`
- `updateDishType` → `resolvers/dishType.js`
- `deleteDishType` → `resolvers/dishType.js`
- `createDish` → `resolvers/dish.js`
- `updateDish` → `resolvers/dish.js`
- `deleteDish` → `resolvers/dish.js`
- `toggleDishStatus` → `resolvers/dish.js`

**Field Resolver:**
- `Dish.dishType` → `resolvers/dish.js`

### 旧代码保留说明

`index.mjs` 中仍保留了旧的 dish 相关函数实现（约 lines 477-1277），但这些函数已不再被 handler 调用。

**保留原因：**
1. 作为参考实现，便于对比新旧逻辑
2. 如果新的模块化 resolvers 出现问题，可以快速回滚

**清理计划：**
待新的模块化 resolvers 在生产环境验证稳定后（约 1-2 周），可以删除这些旧函数。

---

## 待迁移的 Resolvers

以下 resolver 仍在 `index.mjs` 中（单体结构）：

### Restaurant
- getRestaurant
- createRestaurant
- updateRestaurantInfo
- updateRestaurantSubscriptionPlan

### User
- getUser
- getUserByCognito

### Waiter
- listWaiters
- inviteWaiter
- registerWaiter
- deleteWaiter

### Order
- listOrders
- placeOrder
- checkoutOrder
- updateOrderStatus

**迁移建议：**
按功能模块逐步迁移，每次迁移一个模块（如 Restaurant → User → Waiter → Order）

---

## 新的模块化结构

```
lambdas/emenu_server/
├── config/
│   ├── constants.js          # 订阅限制、令牌策略等常量
│   └── aws-clients.js        # AWS SDK 客户端初始化
├── utils/
│   ├── db.js                 # 数据库连接
│   ├── auth.js               # 认证授权工具
│   ├── email.js              # 邮件发送
│   ├── token.js              # 令牌生成和验证
│   └── subscription-limits.js # 订阅限制检查
├── resolvers/
│   ├── dishType.js           # DishType CRUD
│   ├── dish.js               # Dish CRUD + Field Resolver
│   └── index.js              # 聚合所有 resolvers
└── index.mjs                 # Lambda handler（渐进迁移中）
```

## 优势

1. **职责分离**：配置、工具、业务逻辑分离
2. **可测试性**：每个模块可独立测试
3. **可维护性**：新功能添加到对应模块，不再增加 index.mjs 行数
4. **渐进式**：现有功能不受影响，降低风险
5. **可扩展性**：后续迁移其他模块时，只需复制模式

## 下一步

1. 部署并测试新的 DishType & Dish resolvers
2. 验证前端集成（DishManagerPage）
3. 根据测试结果决定是否迁移下一个模块（建议：Restaurant）
