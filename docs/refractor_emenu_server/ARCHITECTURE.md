# eMenu 后端架构图

## 🏗️ 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway / AppSync                     │
│                     (GraphQL Endpoint)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ GraphQL Request
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AWS Lambda: emenu_server                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     index.mjs (Handler)                    │  │
│  │  • 接收 AppSync event                                      │  │
│  │  • 认证检查 (identity.sub)                                 │  │
│  │  • 路由到对应 resolver                                     │  │
│  │  • 错误处理和日志                                          │  │
│  └─────────────────┬─────────────────────────────────────────┘  │
│                    │                                             │
│         ┌──────────┴───────────┬────────────┬─────────────┐     │
│         ▼                      ▼            ▼             ▼     │
│  ┌─────────────┐   ┌────────────────┐   ┌─────────┐  ┌──────┐  │
│  │  Resolvers  │   │     Utils      │   │ Config  │  │Middle│  │
│  │             │   │                │   │         │  │ ware │  │
│  │ • dishType  │   │ • auth.js      │   │• const. │  │(预留)│  │
│  │ • dish      │   │ • db.js        │   │• aws-   │  │      │  │
│  │ • (future)  │   │ • email.js     │   │ clients │  │      │  │
│  │   restaurant│   │ • token.js     │   │         │  │      │  │
│  │   user      │   │ • subscription │   │         │  │      │  │
│  │   waiter    │   │   -limits.js   │   │         │  │      │  │
│  │   order     │   │                │   │         │  │      │  │
│  └─────────────┘   └────────────────┘   └─────────┘  └──────┘  │
│                                                                  │
│  Lambda Layer: /opt/nodejs/models/                              │
│  ├── restaurant.js (Mongoose Model)                             │
│  ├── user.js                                                    │
│  ├── dish.js                                                    │
│  ├── dishType.js                                                │
│  └── order.js                                                   │
└──────────────────────────┬───────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  ┌──────────┐      ┌────────────┐     ┌───────────┐
  │ MongoDB  │      │  Cognito   │     │    SES    │
  │(Database)│      │   (Auth)   │     │  (Email)  │
  └──────────┘      └────────────┘     └───────────┘
        ▲
        │ URI from
        ▼
  ┌──────────┐
  │   SSM    │
  │Parameter │
  │  Store   │
  └──────────┘
```

---

## 🔄 请求处理流程

### 示例：创建菜品 (createDish)

```
1. 客户端发送 GraphQL Mutation
   ↓
   mutation CreateDish {
     createDish(input: {
       dishTypeId: "xxx"
       name: "红烧牛肉面"
       price: 15.50
     }) { id name }
   }

2. AppSync 接收请求
   ↓
   • 验证 GraphQL schema
   • 检查 Authorization (Cognito User Pool)
   • 构造 event 对象

3. Lambda Handler (index.mjs)
   ↓
   • 读取 event.fieldName = "createDish"
   • 读取 event.identity (Cognito User)
   • 调用 connectDb() 连接数据库
   • 路由: case "createDish"

4. Resolver (resolvers/dish.js: createDish)
   ↓
   Step 4.1: 权限验证
   • requireBoss(identity) 
   • 从 Cognito ID 查找 User 文档
   • 检查 user.role === 'boss'
   
   Step 4.2: 获取餐厅信息
   • getRestaurantIdFromIdentity(identity)
   • 返回 user.restaurantId
   
   Step 4.3: 订阅限制检查
   • checkDishLimit(restaurantId)
   • 查询 Restaurant 的 subscriptionPlan
   • 统计当前 Dish 数量
   • 比较限制 (FREE: 10, PRO: 200)
   
   Step 4.4: 验证 DishType
   • 查询 DishType.findOne({ _id, restaurantId })
   • 确保 dishType 存在且属于当前餐厅
   
   Step 4.5: 自动 sortOrder
   • 查询同分类下最大 sortOrder
   • 设置新菜品 sortOrder = max + 1
   
   Step 4.6: 创建菜品
   • new Dish({ ... })
   • dish.save()

5. 返回结果
   ↓
   • Resolver 返回 Dish 对象
   • Lambda 返回 JSON
   • AppSync 格式化为 GraphQL Response
   • 客户端接收数据
```

---

## 📦 模块依赖关系

```
index.mjs
  │
  ├─> resolvers/index.js
  │     │
  │     ├─> resolvers/dishType.js
  │     │     │
  │     │     ├─> utils/auth.js ────────┐
  │     │     │                         │
  │     │     └─> utils/subscription    │
  │     │         -limits.js ────┐      │
  │     │                        │      │
  │     └─> resolvers/dish.js    │      │
  │           │                  │      │
  │           ├─> utils/auth.js ─┘      │
  │           │                         │
  │           └─> utils/subscription    │
  │               -limits.js ────────┐  │
  │                                  │  │
  ├─> utils/db.js                   │  │
  │     │                            │  │
  │     └─> config/aws-clients.js   │  │
  │                                  │  │
  ├─> utils/email.js                │  │
  │     │                            │  │
  │     └─> config/aws-clients.js   │  │
  │                                  │  │
  ├─> utils/token.js                │  │
  │     │                            │  │
  │     └─> config/constants.js     │  │
  │                                  │  │
  └─> config/                        │  │
        │                            │  │
        ├─> constants.js <───────────┘  │
        │                               │
        └─> aws-clients.js              │
                                        │
utils/auth.js                           │
  │                                     │
  └─> /opt/nodejs/models/user.js       │
                                        │
utils/subscription-limits.js <─────────┘
  │
  ├─> /opt/nodejs/models/restaurant.js
  ├─> /opt/nodejs/models/dishType.js
  ├─> /opt/nodejs/models/dish.js
  └─> config/constants.js
```

---

## 🎭 数据流向图

### Query: listDishes (with Field Resolver)

```
Client
  │
  │ GraphQL Query:
  │ listDishes { id, name, dishType { name } }
  ▼
AppSync
  │
  │ Authorization: Cognito Token
  ▼
Lambda Handler (index.mjs)
  │
  │ case "listDishes"
  ▼
resolvers/dish.js: listDishes()
  │
  ├─> utils/auth.js: getRestaurantIdFromIdentity()
  │     │
  │     └─> MongoDB: User.findOne({ cognitoId })
  │           │
  │           └─> return user.restaurantId
  │
  └─> MongoDB: Dish.find({ restaurantId, isDeleted: false })
        │
        │ Result: [
        │   { id: "1", name: "面", dishTypeId: "A" },
        │   { id: "2", name: "饭", dishTypeId: "B" }
        │ ]
        ▼
AppSync (自动调用 Field Resolver)
  │
  │ For each Dish, resolve "dishType" field
  ▼
resolvers/dish.js: resolveDishType(parent)
  │
  └─> MongoDB: DishType.findById(parent.dishTypeId)
        │
        │ Result for Dish 1: { id: "A", name: "主食" }
        │ Result for Dish 2: { id: "B", name: "小吃" }
        ▼
Final Response to Client:
{
  "listDishes": [
    {
      "id": "1",
      "name": "面",
      "dishType": { "name": "主食" }
    },
    {
      "id": "2",
      "name": "饭",
      "dishType": { "name": "小吃" }
    }
  ]
}
```

---

## 🔐 权限验证流程

```
GraphQL Request
  │
  │ Authorization: Bearer <Cognito Token>
  ▼
AppSync
  │
  │ 验证 Cognito Token
  │ 提取 identity.sub (Cognito User ID)
  ▼
Lambda Handler
  │
  │ event.identity.sub = "cognito-user-123"
  ▼
Resolver: createDishType()
  │
  ├─> utils/auth.js: requireBoss(identity)
  │     │
  │     ├─> getUserRole(identity)
  │     │     │
  │     │     └─> MongoDB: User.findOne({ 
  │     │           cognitoId: identity.sub,
  │     │           isDeleted: false 
  │     │         })
  │     │           │
  │     │           └─> user.role.toLowerCase() // "boss" or "waiter"
  │     │
  │     └─> requireRole(identity, ['boss'])
  │           │
  │           ├─ IF role === 'boss' → ✅ 继续
  │           └─ ELSE → ❌ throw Error("PERMISSION_DENIED")
  │
  └─> 执行业务逻辑（创建菜品分类）
```

---

## 💾 数据库交互图

```
Lambda Resolvers
  │
  │ First Request
  ▼
utils/db.js: connectDb()
  │
  ├─> 检查 mongoose.connection.readyState
  │     │
  │     └─ 如果已连接 → 跳过
  │
  ├─> 检查 cachedDbUri
  │     │
  │     ├─ 如果缓存存在 → 使用缓存
  │     │
  │     └─ 如果缓存不存在:
  │         │
  │         └─> AWS SSM: GetParameter({ 
  │               Name: process.env.DB_PARAM_NAME 
  │             })
  │               │
  │               └─> cachedDbUri = response.Parameter.Value
  │
  └─> mongoose.connect(cachedDbUri)
        │
        ▼
      MongoDB Atlas
        │
        ├─ Collections:
        │   ├── restaurants
        │   ├── users
        │   ├── dishTypes (索引: { restaurantId, isDeleted, sortOrder })
        │   ├── dishes (索引: { restaurantId, dishTypeId, isDeleted, sortOrder })
        │   └── orders
        │
        └─ 后续请求复用连接 (Lambda 热启动)
```

---

## 🧩 订阅限制检查流程

```
createDish Mutation
  │
  │ Boss 创建新菜品
  ▼
resolvers/dish.js: createDish()
  │
  └─> utils/subscription-limits.js: checkDishLimit(restaurantId)
        │
        ├─> MongoDB: Restaurant.findById(restaurantId)
        │     │
        │     └─> { subscriptionPlan: "FREE" }
        │
        ├─> MongoDB: Dish.countDocuments({ 
        │     restaurantId, 
        │     isDeleted: false 
        │   })
        │     │
        │     └─> currentCount = 8
        │
        ├─> config/constants.js: SUBSCRIPTION_LIMITS
        │     │
        │     └─> FREE.dishes = 10
        │
        ├─> 比较: currentCount (8) >= limit (10)?
        │     │
        │     ├─ NO (8 < 10) → ✅ 返回 { currentCount: 8, limit: 10, remaining: 2 }
        │     │
        │     └─ YES (≥ 10) → ❌ throw Error("已达到FREE版本菜品数量限制（10个）")
        │
        └─> Resolver 继续执行
```

---

## 📤 邮件发送流程

```
inviteWaiter Mutation
  │
  │ Boss 邀请新服务员
  ▼
Resolver: inviteWaiter()
  │
  ├─> utils/token.js: generateInviteToken()
  │     │
  │     └─> crypto.randomBytes(32).toString('hex')
  │           │
  │           └─> inviteToken = "a1b2c3..."
  │
  ├─> 创建 User 文档:
  │     { 
  │       email, 
  │       inviteToken, 
  │       status: 'pending',
  │       restaurantId 
  │     }
  │
  └─> utils/email.js: sendInviteEmail(email, inviteLink)
        │
        └─> AWS SES: SendEmailCommand({
              Source: "noreply@emenu.au",
              Destination: { ToAddresses: [email] },
              Message: {
                Subject: "Emenu Waiter Invitation",
                Body: { Html: { Data: `<a href="${inviteLink}">...</a>` } }
              }
            })
              │
              ▼
            服务员邮箱收到邀请邮件
              │
              │ 点击链接
              ▼
            registerWaiter Mutation (前端调用)
```

---

## 🔄 渐进式重构路线图

```
Phase 1: 基础设施 ✅ (已完成)
  │
  ├─ 创建目录结构
  ├─ 提取配置常量
  ├─ 提取工具函数
  └─ 设计 Resolver 模式

Phase 2: DishType & Dish ✅ (已完成)
  │
  ├─ resolvers/dishType.js (4 resolvers)
  ├─ resolvers/dish.js (5 resolvers + 1 field resolver)
  └─ 更新 index.mjs 路由

Phase 3: Restaurant (计划中)
  │
  ├─ resolvers/restaurant.js
  ├─ getRestaurant
  ├─ createRestaurant
  ├─ updateRestaurantInfo
  └─ updateRestaurantSubscriptionPlan

Phase 4: User & Waiter (计划中)
  │
  ├─ resolvers/user.js
  │   ├─ getUser
  │   └─ getUserByCognito
  │
  └─ resolvers/waiter.js
      ├─ listWaiters
      ├─ inviteWaiter
      ├─ registerWaiter
      └─ deleteWaiter

Phase 5: Order (计划中)
  │
  ├─ resolvers/order.js
  │   ├─ listOrders
  │   ├─ placeOrder
  │   ├─ checkoutOrder
  │   └─ updateOrderStatus
  │
  └─ resolvers/orderItem.js (if needed)

Phase 6: 清理和优化 (计划中)
  │
  ├─ 删除 index.mjs 中的旧函数
  ├─ 编写单元测试
  ├─ 性能优化
  └─ 文档完善

Final State: 完全模块化
  │
  ├─ index.mjs (~800 lines, 纯路由层)
  ├─ config/ (2 files)
  ├─ utils/ (5+ files)
  ├─ resolvers/ (7+ files)
  ├─ middleware/ (future)
  └─ tests/ (future)
```

---

## 🎯 架构优势

### 1. 关注点分离
- **Config**: 配置管理（常量、客户端）
- **Utils**: 通用工具（数据库、认证、邮件）
- **Resolvers**: 业务逻辑（GraphQL 处理）
- **Handler**: 请求路由（入口层）

### 2. 可测试性
- 每个模块可独立导入测试
- 工具函数易于 mock
- Resolver 逻辑清晰，测试用例明确

### 3. 可维护性
- 新功能添加到对应模块
- 代码复用率高（utils/）
- 文件职责单一，易于理解

### 4. 可扩展性
- 支持渐进式迁移（现有功能不受影响）
- 新增 resolver 只需复制模式
- 中间件预留位置（middleware/）

### 5. 性能优化
- SSM 参数缓存（避免重复调用）
- MongoDB 连接复用（Lambda 热启动）
- 索引优化（复合索引 + 查询模式匹配）
- Field Resolver 按需加载（避免过度查询）

---

**详细文档**: 查看 [README.md](./README.md) 和 [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)
