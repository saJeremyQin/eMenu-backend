import User from '/opt/nodejs/models/user.js';

// getUser 查询（按 cognitoId 查找，兼容 admin 权限）
export async function getUser(args, identity) {
  console.log('Executing getUser...');
  const requestedCognitoId = args.id; // GraphQL query 的 id 参数
  const callerCognitoId = identity.sub;
  const callerGroups = identity.claims && identity.claims['cognito:groups'] ? identity.claims['cognito:groups'] : [];

  console.log(`getUser request: Caller cognitoId: ${callerCognitoId}, Requested cognitoId: ${requestedCognitoId}`);
  console.log(`Caller Groups: ${callerGroups.join(', ')}`);

  if (callerGroups.includes('admin')) {
    console.log(`Authorization: Caller ${callerCognitoId} is an admin. Allowing query for ${requestedCognitoId}.`);
  } else if (requestedCognitoId === callerCognitoId) {
    console.log(`Authorization: Caller ${callerCognitoId} is querying their own user data. Allowing.`);
  } else {
    console.error(`Authorization: Caller ${callerCognitoId} is not authorized to query user ${requestedCognitoId}.`);
    throw new Error("Unauthorized: You are not authorized to access this user's information.");
  }

  try {
    const user = await User.findOne({ cognitoId: requestedCognitoId });
    if (!user) {
      console.error(`User with cognitoId ${requestedCognitoId} not found.`);
      return null;
    }
    return {
      id: user._id ? user._id.toString() : user.cognitoId,
      cognitoId: user.cognitoId,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId ? user.restaurantId.toString() : null,
      isDeleted: !!user.isDeleted,
    };
  } catch (err) {
    console.error(`Error fetching user ${requestedCognitoId}:`, err);
    throw new Error(`Failed to fetch user: ${err.message}`);
  }
}

// getUserByCognito 查询（按 cognitoId 查找，参数名为 cid，兼容 admin 权限）
export async function getUserByCognito(args, identity) {
  console.log('Executing getUserByCognito...');
  const requestedCognitoId = args.cid; // GraphQL query 的 cid 参数
  const callerCognitoId = identity.sub;
  const callerGroups = identity.claims && identity.claims['cognito:groups'] ? identity.claims['cognito:groups'] : [];

  console.log(`getUserByCognito request: Caller cognitoId: ${callerCognitoId}, Requested cognitoId: ${requestedCognitoId}`);
  console.log(`Caller Groups: ${callerGroups.join(', ')}`);

  if (callerGroups.includes('admin')) {
    console.log(`Authorization: Caller ${callerCognitoId} is an admin. Allowing query for ${requestedCognitoId}.`);
  } else if (requestedCognitoId === callerCognitoId) {
    console.log(`Authorization: Caller ${callerCognitoId} is querying their own user data. Allowing.`);
  } else {
    console.error(`Authorization: Caller ${callerCognitoId} is not authorized to query user ${requestedCognitoId}.`);
    throw new Error("Unauthorized: You are not authorized to access this user's information.");
  }

  try {
    const user = await User.findOne({ cognitoId: requestedCognitoId });
    if (!user) {
      console.error(`User with cognitoId ${requestedCognitoId} not found.`);
      return null;
    }
    return {
      id: user._id ? user._id.toString() : user.cognitoId,
      cognitoId: user.cognitoId,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId ? user.restaurantId.toString() : null,
      isDeleted: !!user.isDeleted,
    };
  } catch (err) {
    console.error(`Error fetching user ${requestedCognitoId}:`, err);
    throw new Error(`Failed to fetch user: ${err.message}`);
  }
}
