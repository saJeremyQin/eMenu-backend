/**
 * Token 工具函数
 * 生成和验证邀请令牌
 */
import crypto from 'crypto';
import { INVITE_TOKEN_TTL_HOURS } from '../config/constants.js';

/**
 * 生成随机邀请令牌
 * @returns {string} 32字节的十六进制令牌
 */
export function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 检查邀请令牌是否过期
 * 使用用户的 updatedAt（重新邀请）或 createdAt（首次邀请）时间戳
 * @param {Object} userDoc - 用户文档对象
 * @returns {boolean} 如果过期返回 true
 */
export function isInviteTokenExpired(userDoc) {
  try {
    const issuedAt = userDoc.updatedAt || userDoc.createdAt;
    if (!issuedAt) return true; // 防御性：无时间戳视为过期
    const issued = new Date(issuedAt).getTime();
    const now = Date.now();
    const ttlMs = INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000;
    return now - issued > ttlMs;
  } catch (e) {
    return true;
  }
}
