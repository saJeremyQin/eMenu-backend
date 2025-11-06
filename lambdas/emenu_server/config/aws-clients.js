/**
 * AWS 客户端初始化
 * 集中管理所有 AWS SDK 客户端实例
 */
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SESClient } from "@aws-sdk/client-ses";
import { SSMClient } from "@aws-sdk/client-ssm";

const AWS_REGION = "ap-southeast-2";

export const cognitoClient = new CognitoIdentityProviderClient({ region: AWS_REGION });
export const sesClient = new SESClient({ region: AWS_REGION });
export const ssmClient = new SSMClient({ region: AWS_REGION });
