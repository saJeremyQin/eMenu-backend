/**
 * 配置常量
 * 包含订阅计划限制和邀请令牌策略
 */

// ====================================================================
// SUBSCRIPTION PLAN LIMITS CONSTANTS
// ====================================================================
export const SUBSCRIPTION_LIMITS = {
  BASIC: {
    restaurants: 1,
    dishTypes: 2,
    dishes: 10,
    waiters: 2
  },
  PREMIUM: {
    restaurants: 1,
    dishTypes: 20,
    dishes: 200,
    waiters: 20
  }
};

// ====================================================================
// INVITE TOKEN POLICY
// ====================================================================
// TTL (in hours) for waiter invite tokens. After this window, the token is
// considered expired and registration must be re-invited by boss.
export const INVITE_TOKEN_TTL_HOURS = 72; // 3 days
