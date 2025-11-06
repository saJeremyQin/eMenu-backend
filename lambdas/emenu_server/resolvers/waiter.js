import Restaurant from '/opt/nodejs/models/restaurant.js';
import User from '/opt/nodejs/models/user.js';
import { requireRole, getRestaurantIdFromIdentity } from '../utils/auth.js';
import { checkWaiterLimit } from '../utils/subscription-limits.js';
import { sendInviteEmail } from '../utils/email.js';
import { generateInviteToken, isInviteTokenExpired } from '../utils/token.js';
import { INVITE_TOKEN_TTL_HOURS } from '../config/constants.js';
import { cognitoClient } from '../config/aws-clients.js';
import { AdminGetUserCommand, AdminCreateUserCommand, AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider';

// 查询：获取当前餐厅的所有服务员
export async function listWaiters(args, identity) {
  console.log('Executing listWaiters...');
  await requireRole(identity, ['boss']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  try {
    const restaurant = await Restaurant.findById(restaurantId).populate({
      path: 'waiters',
      match: { isDeleted: false },
      options: { sort: { createdAt: -1 } }
    });
    if (!restaurant) throw new Error('Restaurant not found');
    const waiters = restaurant.waiters || [];
    return waiters.map(waiter => ({
      id: waiter._id.toString(),
      cognitoId: waiter.cognitoId,
      email: waiter.email,
      role: waiter.role,
      restaurantId: waiter.restaurantId.toString(),
      isDeleted: waiter.isDeleted,
      inviteToken: waiter.inviteToken,
      status: waiter.status,
      createdAt: waiter.createdAt ? waiter.createdAt.toISOString() : null,
      updatedAt: waiter.updatedAt ? waiter.updatedAt.toISOString() : null,
    }));
  } catch (err) {
    console.error(`Error fetching waiters for restaurant ${restaurantId}:`, err);
    throw new Error(`Failed to fetch waiters: ${err.message}`);
  }
}

// 邀请服务员（发送邀请邮件）
export async function inviteWaiter(args, identity) {
  console.log('Executing inviteWaiter...');
  await requireRole(identity, ['boss']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const isDev = process.env.ENVIRONMENT === 'dev';
  const baseUrl = isDev ? 'http://localhost:5173/waiter-register' : 'https://admin.emenu.au/waiter-register';

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new Error('Restaurant not found for this boss');

  await checkWaiterLimit(restaurant._id);
  const { email } = args;
  if (!email) throw new Error('Email is required to invite a waiter');

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.isDeleted) {
        const newInviteToken = generateInviteToken();
        const reactivatedUser = await User.findByIdAndUpdate(
          existingUser._id,
          {
            isDeleted: false,
            role: 'waiter',
            restaurantId: restaurant._id,
            updatedAt: new Date(),
            inviteToken: newInviteToken,
            status: 'PENDING',
          },
          { new: true }
        );
        console.log('Waiter reactivated successfully:', reactivatedUser._id);
        if (!restaurant.waiters) restaurant.waiters = [];
        if (!restaurant.waiters.includes(reactivatedUser._id)) {
          restaurant.waiters.push(reactivatedUser._id);
          await restaurant.save();
          console.log('Waiter added to restaurant.waiters:', restaurant._id);
        }
        const inviteLink = `${baseUrl}?token=${newInviteToken}`;
        await sendInviteEmail(email, inviteLink);
        return reactivatedUser.toJSON();
      } else {
        throw new Error('User with this email already exists and is active');
      }
    }

    const inviteToken = generateInviteToken();
    const newWaiter = new User({
      email,
      cognitoId: null,
      role: 'waiter',
      restaurantId: restaurant._id,
      isDeleted: false,
      inviteToken,
      status: 'PENDING',
    });
    const savedWaiter = await newWaiter.save();
    console.log('Waiter invited successfully:', savedWaiter._id);
    if (!restaurant.waiters) restaurant.waiters = [];
    if (!restaurant.waiters.includes(savedWaiter._id)) {
      restaurant.waiters.push(savedWaiter._id);
      await restaurant.save();
      console.log('Waiter added to restaurant.waiters:', restaurant._id);
    }
    const inviteLink = `${baseUrl}?token=${inviteToken}`;
    await sendInviteEmail(email, inviteLink);
    return savedWaiter.toJSON();
  } catch (error) {
    console.error('Error inviting waiter:', error);
    throw error;
  }
}

// 注册服务员（通过邀请链接）
export async function registerWaiter(args, identity) {
  console.log('Executing registerWaiter...');
  const { token, password } = args;
  if (!token || !password) throw new Error('Token and password are required.');

  const waiter = await User.findOne({ inviteToken: token, role: 'waiter', isDeleted: false });
  if (!waiter) {
    throw new Error('INVITE_TOKEN_INVALID_OR_USED: Invite link is invalid or already used. Please request a new invitation.');
  }
  if (waiter.status === 'ACTIVE' || waiter.cognitoId) {
    throw new Error('WAITER_ALREADY_ACTIVE: This invitation has already been used. You can sign in directly.');
  }
  if (isInviteTokenExpired(waiter)) {
    throw new Error(`INVITE_TOKEN_EXPIRED: Invite link expired. Please request a new invitation (valid for ${INVITE_TOKEN_TTL_HOURS} hours).`);
  }

  if (waiter.restaurantId) {
    try {
      await checkWaiterLimit(waiter.restaurantId);
    } catch (limitErr) {
      console.error('Waiter limit exceeded during registration:', limitErr);
      throw new Error('Cannot register: restaurant has reached waiter limit for current subscription plan.');
    }
  }

  const userPoolId = process.env.WAITER_USER_POOL_ID;
  if (!userPoolId) throw new Error('WAITER_USER_POOL_ID is not set in environment variables.');

  let cognitoId;
  try {
    let cognitoUser;
    try {
      const getUserRes = await cognitoClient.send(new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: waiter.email
      }));
      cognitoUser = getUserRes;
    } catch (e) {
      const createUserRes = await cognitoClient.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: waiter.email,
        UserAttributes: [
          { Name: 'email', Value: waiter.email },
          { Name: 'email_verified', Value: 'true' }
        ],
        MessageAction: 'SUPPRESS'
      }));
      cognitoUser = createUserRes.User;
    }

    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: waiter.email,
      Password: password,
      Permanent: true
    }));

    let subAttr;
    if (cognitoUser.UserAttributes) {
      subAttr = cognitoUser.UserAttributes.find(attr => attr.Name === 'sub');
    } else if (cognitoUser.Attributes) {
      subAttr = cognitoUser.Attributes.find(attr => attr.Name === 'sub');
    }
    cognitoId = subAttr ? subAttr.Value : null;
    if (!cognitoId) throw new Error('Cognito user sub not found.');
  } catch (err) {
    console.error('Error creating or updating Cognito user:', err);
    throw new Error('Failed to register waiter in Cognito.');
  }

  waiter.cognitoId = cognitoId;
  waiter.status = 'ACTIVE';
  waiter.inviteToken = null;
  await waiter.save();
  console.log('Waiter registered and activated:', waiter._id);

  if (waiter.restaurantId) {
    const restaurant = await Restaurant.findById(waiter.restaurantId);
    if (restaurant) {
      if (!restaurant.waiters) restaurant.waiters = [];
      if (!restaurant.waiters.includes(waiter._id)) {
        restaurant.waiters.push(waiter._id);
        await restaurant.save();
        console.log('Waiter added to restaurant.waiters:', restaurant._id);
      }
    }
  }

  return {
    id: waiter._id.toString(),
    cognitoId: waiter.cognitoId,
    email: waiter.email,
    role: waiter.role,
    status: waiter.status,
    createdAt: waiter.createdAt ? waiter.createdAt.toISOString() : new Date().toISOString()
  };
}

// 软删除服务员
export async function deleteWaiter(args, identity) {
  console.log('Executing deleteWaiter...');
  await requireRole(identity, ['boss']);
  const restaurantId = await getRestaurantIdFromIdentity(identity);
  const { id } = args;
  try {
    const waiter = await User.findOne({ _id: id, restaurantId, role: 'waiter', isDeleted: false });
    if (!waiter) throw new Error('Waiter not found or already deleted.');
    waiter.isDeleted = true;
    await waiter.save();
    console.log('Waiter soft deleted:', waiter._id);
    const restaurant = await Restaurant.findById(restaurantId);
    if (restaurant && restaurant.waiters) {
      restaurant.waiters = restaurant.waiters.filter(wId => wId.toString() !== waiter._id.toString());
      await restaurant.save();
      console.log('Waiter removed from restaurant.waiters:', restaurant._id);
    }
    return true;
  } catch (err) {
    console.error(`Error deleting waiter ${id}:`, err);
    throw new Error(`Failed to delete waiter: ${err.message}`);
  }
}
