# Git Commit Message 建议

## 🎯 推荐的 Commit Message

```
refactor(backend): 渐进式重构 - 实现模块化架构 (DishType & Dish)

### 重构目标
将 1405 行的单体 Lambda handler 重构为模块化架构，提升代码可维护性、可测试性和可扩展性。

### 本次变更 (Phase 1 & 2)

#### 新增文件
- config/constants.js - 订阅限制和令牌策略常量
- config/aws-clients.js - AWS SDK 客户端初始化
- utils/db.js - MongoDB 连接管理（SSM 参数缓存）
- utils/auth.js - 认证授权工具（RBAC 辅助函数）
- utils/email.js - SES 邮件发送
- utils/token.js - 令牌生成和验证
- utils/subscription-limits.js - 订阅限制检查
- resolvers/dishType.js - DishType CRUD resolvers
- resolvers/dish.js - Dish CRUD resolvers + Field Resolver
- resolvers/index.js - Resolver 聚合导出

#### 更新文件
- index.mjs - 导入新 resolvers，更新路由逻辑
- models/dishType.js - 新增 isActive, sortOrder, 优化索引
- models/dish.js - 新增 sortOrder, 优化索引（移除冗余单字段索引）
- infra/main/schema.graphql - 更新 DishType 和 Dish 类型定义

#### 文档
- README.md - 模块化架构使用指南
- REFACTORING_SUMMARY.md - 重构总结和成果
- REFACTORING_PROGRESS.md - 重构进度追踪
- DEPLOYMENT_CHECKLIST.md - 部署前检查清单
- ARCHITECTURE.md - 架构图和数据流向

### 架构改进

#### 模块化结构
```
lambdas/emenu_server/
├── config/         # 配置管理
├── utils/          # 工具函数
├── resolvers/      # GraphQL resolvers
└── middleware/     # 中间件（预留）
```

#### 职责分离
- 配置层 (config/): 常量和客户端初始化
- 工具层 (utils/): 可复用的业务无关函数
- 业务层 (resolvers/): GraphQL 业务逻辑
- 入口层 (index.mjs): 请求路由和错误处理

### 功能实现

#### DishType Management (4 resolvers)
- listDishTypes (Query)
- createDishType (Mutation) - Boss only, 订阅限制检查
- updateDishType (Mutation) - Boss only
- deleteDishType (Mutation) - Boss only, 软删除

#### Dish Management (5 resolvers + 1 field resolver)
- listDishes (Query) - 支持 dishTypeId 过滤
- createDish (Mutation) - Boss only, 订阅限制检查, DishType 验证
- updateDish (Mutation) - Boss only
- deleteDish (Mutation) - Boss only, 软删除
- toggleDishStatus (Mutation) - Boss only, 快捷上架/下架
- Dish.dishType (Field Resolver) - 填充完整的 DishType 对象

### 安全性增强
- ✅ 严格的权限验证 (requireBoss)
- ✅ 数据隔离 (按 restaurantId 自动过滤)
- ✅ DishType 归属验证（防止跨餐厅引用）
- ✅ 订阅限制检查（BASIC/PREMIUM）

### 性能优化
- ✅ SSM 参数缓存（避免重复调用）
- ✅ MongoDB 连接复用（Lambda 热启动）
- ✅ 复合索引优化（移除冗余单字段索引）
- ✅ Field Resolver 按需加载

### 测试建议
```graphql
# 1. 创建菜品分类
mutation {
  createDishType(name: "主食", alias: "Staples") { id name }
}

# 2. 创建菜品
mutation {
  createDish(input: { 
    dishTypeId: "xxx", 
    name: "红烧牛肉面", 
    price: 15.50 
  }) { 
    id 
    name 
    dishType { name } 
  }
}

# 3. 列出菜品（含分类信息）
query {
  listDishes { 
    id 
    name 
    dishType { name } 
  }
}
```

### 渐进式迁移策略
- ✅ Phase 1: 基础设施（目录结构、配置、工具）
- ✅ Phase 2: DishType & Dish resolvers
- ⏸️ Phase 3: Restaurant resolvers (待迁移)
- ⏸️ Phase 4: User & Waiter resolvers (待迁移)
- ⏸️ Phase 5: Order resolvers (待迁移)
- ⏸️ Phase 6: 清理旧代码、编写测试、优化

### 向后兼容性
- ✅ 现有功能（Restaurant, User, Waiter, Order）保持不变
- ✅ 旧函数保留作为参考（标记为 LEGACY）
- ✅ 新旧代码可并存运行
- ✅ 支持快速回滚

### Breaking Changes
无破坏性变更，所有现有 API 保持兼容。

### 下一步
1. 部署到 dev 环境测试
2. 验证前端集成（DishManagerPage）
3. 监控性能指标（执行时间、错误率）
4. 根据测试结果决定是否迁移下一模块（Restaurant）

### 相关文档
- docs/REFACTORING_SUMMARY.md
- docs/DEPLOYMENT_CHECKLIST.md
- docs/ARCHITECTURE.md

---
Closes #[issue_number]
```

---

## 📝 分步 Commit 建议（如果需要更细粒度）

### Commit 1: 基础设施
```
refactor(backend): 创建模块化目录结构和配置文件

- 新增 config/constants.js - 订阅限制常量
- 新增 config/aws-clients.js - AWS 客户端初始化
- 新增 utils/db.js - 数据库连接工具
- 新增 utils/auth.js - 认证授权工具
- 新增 utils/email.js - 邮件发送工具
- 新增 utils/token.js - 令牌工具
- 新增 utils/subscription-limits.js - 订阅限制检查
```

### Commit 2: DishType Resolvers
```
feat(backend): 实现 DishType CRUD resolvers

- 新增 resolvers/dishType.js
  - listDishTypes (Query)
  - createDishType (Mutation)
  - updateDishType (Mutation)
  - deleteDishType (Mutation)
- 更新 models/dishType.js - 新增 isActive, sortOrder 字段
- 优化索引: { restaurantId, isDeleted, sortOrder }
```

### Commit 3: Dish Resolvers
```
feat(backend): 实现 Dish CRUD resolvers + Field Resolver

- 新增 resolvers/dish.js
  - listDishes (Query)
  - createDish (Mutation)
  - updateDish (Mutation)
  - deleteDish (Mutation)
  - toggleDishStatus (Mutation)
  - resolveDishType (Field Resolver)
- 更新 models/dish.js - 新增 sortOrder, 优化索引
- 移除冗余单字段索引，使用复合索引
```

### Commit 4: Handler 集成
```
refactor(backend): 集成新 resolvers 到 Lambda handler

- 更新 index.mjs
  - 导入 resolvers/index.js
  - 更新 switch case 路由到新 resolvers
  - 标记旧函数为 LEGACY（保留作为参考）
- 新增 resolvers/index.js - Resolver 聚合导出
```

### Commit 5: GraphQL Schema 更新
```
feat(backend): 更新 GraphQL schema for DishType & Dish

- 更新 infra/main/schema.graphql
  - DishType 类型: 新增 isActive, sortOrder
  - Dish 类型: 新增 sortOrder, dishType field resolver
  - 移除输出类型中的 dishTypeId（保留在 Input 中）
```

### Commit 6: 文档
```
docs(backend): 添加重构文档和架构指南

- 新增 README.md - 模块化架构使用指南
- 新增 REFACTORING_SUMMARY.md - 重构总结
- 新增 REFACTORING_PROGRESS.md - 进度追踪
- 新增 DEPLOYMENT_CHECKLIST.md - 部署清单
- 新增 ARCHITECTURE.md - 架构图和数据流向
```

---

## 🏷️ Git Tag 建议

```bash
git tag -a v1.1.0-refactor-phase2 -m "渐进式重构 Phase 2: DishType & Dish 模块化"
git push origin v1.1.0-refactor-phase2
```

---

## 📊 Commit 统计

```
文件变更统计:
- 新增: 14 个文件
- 修改: 4 个文件
- 删除: 0 个文件
- 总行数: +~1200 lines (新增模块化代码)

影响范围:
- Backend: Lambda resolvers, models, schema
- Infrastructure: GraphQL schema
- Documentation: 5 个新文档
```
