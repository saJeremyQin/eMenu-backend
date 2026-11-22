/**
 * 认证和授权工具函数
 * 处理用户角色验证和餐厅关联
 */
import User from '/opt/nodejs/models/user.js';
import { AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient } from '../config/aws-clients.js';

/**
 * Find the Mongo user for the caller. If a boss has no record (e.g. the
 * post-confirmation trigger couldn't reach the DB), recreate it.
 * Safe because cognito:groups comes from the Cognito-signed token, and only the
 * post-confirmation trigger adds users to the 'boss' group.
 * @param {Object} identity - AppSync identity
 * @returns {Promise<Object|null>} Mongoose user document, or null
 */
export async function findUserForIdentity(identity) {
  const cognitoId = identity?.sub || identity?.claims?.sub;
  if (!cognitoId) throw new Error('Cognito identity sub not found.');

  const user = await User.findOne({ cognitoId });
  if (user) return user;

  const groups = identity?.claims?.['cognito:groups'] || identity?.groups || [];
  if (!groups.includes('boss')) return null;

  // Access tokens carry no email claim; read it from Cognito instead.
  let email = identity?.claims?.email;
  if (!email) {
    const res = await cognitoClient.send(new AdminGetUserCommand({
      UserPoolId: process.env.WAITER_USER_POOL_ID,
      Username: identity?.username || cognitoId,
    }));
    email = res.UserAttributes?.find(a => a.Name === 'email')?.Value;
  }
  if (!email) return null;

  console.warn('Recreating missing boss user record for cognitoId:', cognitoId);
  // Upsert so concurrent first requests don't create duplicates in the common case.
  return User.findOneAndUpdate(
    { cognitoId },
    { $setOnInsert: { cognitoId, email, role: 'boss', isDeleted: false } },
    { upsert: true, new: true }
  );
}

/**
 * 从 AppSync identity 获取 restaurantId
 * @param {Object} identity - AppSync identity 对象
 * @returns {Promise<string>} restaurantId
 */
export async function getRestaurantIdFromIdentity(identity) {
  const user = await findUserForIdentity(identity);
  if (!user) {
    console.error("User not found for cognitoId:", identity?.sub || identity?.claims?.sub);
    throw new Error("User not found.");
  }
  if (!user.restaurantId) throw new Error("User is not associated with a restaurant.");
  return user.restaurantId;
}

/**
 * 获取用户角色（小写格式）
 * @param {Object} identity - AppSync identity
 * @returns {Promise<'boss'|'waiter'>}
 */
export async function getUserRole(identity) {
  const user = await findUserForIdentity(identity);
  if (!user || user.isDeleted) throw new Error('User not found');
  const role = typeof user.role === 'string' ? user.role.toLowerCase() : user.role;
  return role;
}

/**
 * 确保调用者拥有允许的角色之一
 * @param {Object} identity - AppSync identity
 * @param {string[]} allowedRoles - 允许的角色，例如 ['boss']
 * @returns {Promise<string>} - 解析后的角色
 */
export async function requireRole(identity, allowedRoles) {
  const role = await getUserRole(identity);
  const normalized = allowedRoles.map(r => (typeof r === 'string' ? r.toLowerCase() : r));
  if (!normalized.includes(role)) {
    throw new Error(`PERMISSION_DENIED: Required role: ${normalized.join(' or ')}, but you are: ${role}`);
  }
  return role;
}

/**
 * 要求调用者是 boss 角色
 * @param {Object} identity - AppSync identity
 */
export async function requireBoss(identity) {
  await requireRole(identity, ['boss']);
}

/**
 * 要求调用者是 boss 或 waiter 角色
 * @param {Object} identity - AppSync identity
 */
export async function requireBossOrWaiter(identity) {
  await requireRole(identity, ['boss', 'waiter']);
}

/**
 * 检查用户是否为 boss
 * @param {Object} identity - AppSync identity
 * @returns {Promise<boolean>}
 */
export async function isBoss(identity) {
  try {
    const role = await getUserRole(identity);
    return role === 'boss';
  } catch {
    return false;
  }
}
