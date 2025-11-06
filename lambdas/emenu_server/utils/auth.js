/**
 * 认证和授权工具函数
 * 处理用户角色验证和餐厅关联
 */
import User from '/opt/nodejs/models/user.js';

/**
 * 从 AppSync identity 获取 restaurantId
 * @param {Object} identity - AppSync identity 对象
 * @returns {Promise<string>} restaurantId
 */
export async function getRestaurantIdFromIdentity(identity) {
  const cognitoId = identity?.sub || identity?.claims?.sub;
  console.log("DEBUG: cognitoId is", cognitoId);
  if (!cognitoId) throw new Error("Cognito identity sub not found.");

  const user = await User.findOne({ cognitoId });
  if (!user) {
    const count = await User.countDocuments();
    const allUsers = await User.find().limit(5);
    console.error("DEBUG: First 5 users in DB:", allUsers);
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
  const cognitoId = identity?.sub || identity?.claims?.sub;
  if (!cognitoId) throw new Error('Cognito identity sub not found.');
  const user = await User.findOne({ cognitoId, isDeleted: false });
  if (!user) throw new Error('User not found');
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
