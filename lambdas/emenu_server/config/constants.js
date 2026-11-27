/**
 * 配置常量
 * 包含订阅计划限制和邀请令牌策略
 */

// ====================================================================
// SUBSCRIPTION PLAN LIMITS CONSTANTS
// ====================================================================
// The only source of plan limits: they are derived from restaurant.subscriptionPlan,
// never stored on the restaurant. Dishes, dish types and waiters are unlimited on
// every plan; all waiters of a restaurant share its tables. PRO also gets customer
// QR ordering (v2).
export const SUBSCRIPTION_LIMITS = {
  FREE: { tables: 8 },
  PRO: { tables: 999 } // shown as "unlimited"; the cap only catches typos like 1200
};

export function getTableLimit(subscriptionPlan) {
  const limits = SUBSCRIPTION_LIMITS[subscriptionPlan];
  if (!limits) throw new Error(`Unknown subscription plan: ${subscriptionPlan}`);
  return limits.tables;
}

// ====================================================================
// INVITE TOKEN POLICY
// ====================================================================
// TTL (in hours) for waiter invite tokens. After this window, the token is
// considered expired and registration must be re-invited by boss.
export const INVITE_TOKEN_TTL_HOURS = 72; // 3 days
