# RegisterWaiter Multi-Auth Implementation

## Business Context

The Waiter registration flow needs to support **unauthenticated users** completing registration via invite links, while other GraphQL APIs require authentication through Cognito User Pool. This requires enabling API Key authentication exclusively for the `registerWaiter` mutation.

## Technical Solution

### 1. AppSync Multi-Auth Architecture

Enable AWS AppSync **Multi-Auth** mode to support:
- **Default Authentication**: Amazon Cognito User Pools (for authenticated boss/waiter users)
- **Additional Authentication**: API Key (exclusively for `registerWaiter` mutation)

### 2. Implementation Steps

#### 2.1 Infrastructure Configuration (Terraform)

**File**: `infra/main/appsync.tf`

```hcl
resource "aws_appsync_graphql_api" "emenu_api" {
  name                = "emenu-graphql-api"
  authentication_type = "AMAZON_COGNITO_USER_POOLS"

  # Primary authentication: Cognito User Pools
  user_pool_config {
    user_pool_id   = aws_cognito_user_pool.emenu_user_pool.id
    aws_region     = "ap-southeast-2"
    default_action = "ALLOW"
  }

  # Additional authentication: API Key (for registerWaiter)
  additional_authentication_provider {
    authentication_type = "API_KEY"
  }
}

# Create API Key with 1-year expiry
resource "aws_appsync_api_key" "emenu_api_key" {
  api_id  = aws_appsync_graphql_api.emenu_api.id
  expires = timeadd(timestamp(), "8760h") # 365 days
}
```

**File**: `infra/main/outputs.tf`

```hcl
output "appsync_api_key" {
  value     = aws_appsync_api_key.emenu_api_key.key
  sensitive = true
  description = "AppSync API Key for registerWaiter mutation"
}
```

#### 2.2 GraphQL Schema Design

**File**: `infra/main/schema.graphql`

**Key Design Decision**: Create a dedicated return type `RegisterWaiterPayload` instead of directly returning the `User` type.

```graphql
# User type remains fully Cognito-only (not exposed to API Key)
type User {
  id: ID!
  cognitoId: String
  email: String!
  role: Role!
  restaurantId: ID
  isDeleted: Boolean!
  inviteToken: String
  status: String
  createdAt: String
  updatedAt: String
}

# Dedicated return type: only safe fields, API Key accessible
type RegisterWaiterPayload @aws_api_key {
  id: ID!
  cognitoId: String
  email: String!
  role: Role!
  status: String!
  createdAt: String!
}

type Mutation {
  # Other mutations use default Cognito authentication
  inviteWaiter(email: String!): User
  
  # registerWaiter allows API Key access
  registerWaiter(token: String!, password: String!): RegisterWaiterPayload @aws_api_key
}
```

**Why use a dedicated Payload type?**

| Approach | Pros | Cons |
|----------|------|------|
| **Approach A**: Add `@aws_api_key` to User fields | Simple implementation | Exposes User type fields to API Key; future field additions may be accidentally exposed |
| **Approach B**: Create RegisterWaiterPayload @aws_api_key ✅ | Principle of least privilege; clear isolation; type safety | Requires additional type definition |

We chose **Approach B** following the principle of least privilege.

#### 2.3 Lambda Resolver Implementation

**File**: `lambdas/emenu_server/index.mjs`

**Skip identity verification check**:

```javascript
export const handler = async (event, context) => {
  await connectDb();

  const field = event.fieldName;
  const identity = event.identity;

  // Skip Cognito identity check for registerWaiter (API Key mode)
  if (field !== 'registerWaiter') {
    if (!identity || !identity.sub) {
      throw new Error('Authentication required.');
    }
    console.log('Auth Check: User ID (sub):', identity.sub);
  } else {
    console.log('Auth Check: Skipping for registerWaiter (API Key access)');
  }

  switch (field) {
    case "registerWaiter":
      return await registerWaiter(event.arguments, identity);
    // ... other cases
  }
};
```

**Return Payload object** (instead of full User):

```javascript
const registerWaiter = async (args, identity) => {
  const { token, password } = args;
  
  // 1. Validate inviteToken
  const waiter = await User.findOne({ 
    inviteToken: token, 
    role: 'waiter', 
    isDeleted: false 
  });
  if (!waiter) throw new Error('Invalid or expired token.');

  // 2. Check restaurant waiter count limit
  await checkWaiterLimit(waiter.restaurantId);

  // 3. Create user in Cognito and set password
  const userPoolId = process.env.WAITER_USER_POOL_ID;
  let cognitoUser;
  
  try {
    cognitoUser = await cognitoClient.send(new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: waiter.email
    }));
  } catch (e) {
    const createRes = await cognitoClient.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: waiter.email,
      UserAttributes: [
        { Name: 'email', Value: waiter.email },
        { Name: 'email_verified', Value: 'true' }
      ],
      MessageAction: 'SUPPRESS'
    }));
    cognitoUser = createRes.User;
  }

  await cognitoClient.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: waiter.email,
    Password: password,
    Permanent: true
  }));

  // 4. Get Cognito sub and update DB
  const subAttr = cognitoUser.UserAttributes?.find(attr => attr.Name === 'sub')
                  || cognitoUser.Attributes?.find(attr => attr.Name === 'sub');
  const cognitoId = subAttr?.Value;
  
  waiter.cognitoId = cognitoId;
  waiter.status = 'ACTIVE';
  waiter.inviteToken = null;
  await waiter.save();

  // 5. Return fields matching RegisterWaiterPayload
  return {
    id: waiter._id.toString(),
    cognitoId: waiter.cognitoId,
    email: waiter.email,
    role: waiter.role,
    status: waiter.status,
    createdAt: waiter.createdAt ? waiter.createdAt.toISOString() : new Date().toISOString()
  };
};
```

#### 2.4 Lambda IAM Permissions

**File**: `infra/main/lambda.tf`

Lambda requires permissions to call Cognito Admin APIs:

```hcl
resource "aws_iam_role_policy" "emenu_server_cognito_admin_access" {
  name = "emenu_server_cognito_admin_access"
  role = aws_iam_role.lambda_exec.id
  
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminUpdateUserAttributes"
        ],
        Resource = aws_cognito_user_pool.emenu_user_pool.arn
      }
    ]
  })
}
```

#### 2.5 VTL Mapping Template

**File**: `infra/main/mapping-templates/registerWaiter-request.vtl`

Ensure `fieldName` and `typeName` are passed to Lambda:

```vtl
{
  "version": "2017-02-28",
  "operation": "Invoke",
  "payload": {
    "typeName": "$context.parentTypeName",
    "fieldName": "$context.fieldName",
    "arguments": $util.toJson($context.arguments),
    "identity": $util.toJson($context.identity)
  }
}
```

#### 2.6 Frontend Configuration

**File**: `eMenu-admin/src/aws-config.js`

```javascript
export const awsConfig = {
  aws_appsync_graphqlEndpoint: 'https://xxx.appsync-api.ap-southeast-2.amazonaws.com/graphql',
  aws_appsync_region: 'ap-southeast-2',
  aws_appsync_authenticationType: 'AMAZON_COGNITO_USER_POOLS',
  aws_appsync_apiKey: 'da2-xxxxxxxxxxxxxxxxxxxx', // For registerWaiter
  // ... Cognito config
};
```

**File**: `eMenu-admin/src/pages/WaiterRegister/WaiterRegister.jsx`

Call mutation using API Key mode:

```javascript
import { generateClient } from 'aws-amplify/api';

const WaiterRegister = () => {
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Create client with API Key authentication
    const client = generateClient({ authMode: 'apiKey' });
    
    try {
      const result = await client.graphql({
        query: mutations.registerWaiter,
        variables: {
          token: token,
          password: password
        }
      });
      
      console.log('Registration successful:', result.data.registerWaiter);
      navigate('/login');
    } catch (error) {
      console.error('Registration failed:', error);
      setError('Registration failed. Please check password requirements or contact administrator.');
    }
  };
};
```

## Security Boundaries

### API Key Accessible Resources

| Resource | Access |
|----------|--------|
| registerWaiter mutation | ✅ Allowed |
| RegisterWaiterPayload return fields | ✅ id, cognitoId, email, role, status, createdAt |
| Other User type fields | ❌ restaurantId, inviteToken, isDeleted, updatedAt |
| Other mutations/queries | ❌ Require Cognito authentication |

### Cognito-Protected Resources

All other GraphQL operations require Cognito User Pool token:
- getUser, getUserByCognito
- getRestaurant, listDishes, listOrders
- inviteWaiter, createDish, placeOrder, etc.

---

## Resume Highlights

This implementation demonstrates advanced cloud architecture and security engineering skills suitable for senior full-stack or DevOps roles:

### Key Technical Achievements
- **Multi-Auth Architecture**: Designed and implemented AWS AppSync multi-authentication strategy supporting both Cognito User Pools and API Key authorization with field-level access control
- **Security-First Design**: Applied principle of least privilege by creating dedicated GraphQL payload types to minimize API surface exposure
- **Infrastructure as Code**: Managed complete auth infrastructure using Terraform including IAM policies, API keys, and VTL mapping templates
- **Serverless Integration**: Implemented Lambda resolvers with conditional authentication logic and Cognito Admin API integration
- **Production Debugging**: Diagnosed and resolved complex authorization issues across AppSync, Lambda, and GraphQL schema layers using CloudWatch Logs

### Skills Demonstrated
- AWS AppSync (GraphQL API, Multi-Auth, VTL)
- AWS Cognito (User Pools, Admin APIs)
- AWS Lambda (Node.js, IAM permissions)
- GraphQL Schema Design (Authorization directives, Type design)
- Terraform (AWS provider, Resource management)
- Security Architecture (Field-level authorization, Token-based auth)
- Technical Documentation (Architecture decisions, Deployment guides)

---

## Deployment Process

```bash
# 1. Navigate to backend infrastructure directory
cd eMenu-backend/infra/main

# 2. Initialize Terraform (first time only)
terraform init

# 3. Preview changes
terraform plan

# 4. Apply changes
terraform apply

# 5. Get API Key (for frontend configuration)
terraform output -raw appsync_api_key

# 6. Deploy Lambda code (if code updated)
cd ../../
./deploy.sh
```

## Testing & Validation

### End-to-End Test Scenarios

1. **Boss Invites Waiter**
   - Boss logs in and calls `inviteWaiter` mutation (Cognito auth)
   - System generates `inviteToken` and sends email

2. **Waiter Registration**
   - Waiter clicks invite link (containing token)
   - Frontend uses API Key to call `registerWaiter` mutation
   - Verify returned `RegisterWaiterPayload` contains all expected fields

3. **Waiter Login**
   - After successful registration, Waiter logs in with email and password
   - Cognito returns JWT token
   - Subsequent API calls use Cognito authentication

### CloudWatch Logs Validation

Successful registration log example:

```
Auth Check: Skipping for registerWaiter (API Key access)
Executing registerWaiter...
Waiter registered and activated: new ObjectId('6905e7c4c37957f632450efd')
```

## Troubleshooting

### Issue 1: "Not Authorized to access {field} on type User"

**Cause**: Return type is `User`, but `@aws_api_key` not added to fields

**Solution**: Use dedicated `RegisterWaiterPayload` type with type-level `@aws_api_key`

### Issue 2: "Authentication required"

**Cause**: Lambda performs Cognito identity check for all fields

**Solution**: Skip authentication check for `registerWaiter` in handler

### Issue 3: AccessDeniedException on cognito-idp:AdminCreateUser

**Cause**: Lambda execution role lacks Cognito Admin permissions

**Solution**: Add IAM policy allowing `AdminGetUser`, `AdminCreateUser`, `AdminSetUserPassword`

### Issue 4: Invite link returns null with no clear message

**Cause**: The same invite link was used after successful activation, or the token expired.

**Solution**: Backend returns structured error codes in `message` for precise UX:

- `INVITE_TOKEN_INVALID_OR_USED`: Invite link is invalid or already used
- `WAITER_ALREADY_ACTIVE`: The invitation has been used and the waiter is already active
- `INVITE_TOKEN_EXPIRED`: Invite link expired (default TTL 72 hours); requires a new invitation

Frontend can parse the prefix before the colon to display tailored guidance.

## Architecture Advantages

1. **Security Isolation**: API Key can only access `registerWaiter`, cannot call other sensitive APIs
2. **Minimal Exposure**: Through dedicated Payload type, only returns necessary fields
3. **Flexible Extension**: Future public APIs (e.g., password reset) can add API Key authentication
4. **Type Safety**: GraphQL schema explicitly defines API Key accessible fields, preventing accidental exposure

## Related Documentation

- [AWS AppSync Multi-Auth](https://docs.aws.amazon.com/appsync/latest/devguide/security-authz.html#multiple-authorization-types)
- [AWS Cognito Admin APIs](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_Operations.html)
- [Amplify API Client Auth Modes](https://docs.amplify.aws/react/build-a-backend/graphqlapi/customize-authorization-rules/)
