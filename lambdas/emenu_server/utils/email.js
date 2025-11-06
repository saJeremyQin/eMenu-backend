/**
 * 邮件发送工具
 * 使用 AWS SES 发送邀请邮件
 */
import { SendEmailCommand } from "@aws-sdk/client-ses";
import { sesClient } from '../config/aws-clients.js';

/**
 * 发送服务员邀请邮件
 * @param {string} toEmail - 接收邮件的地址
 * @param {string} inviteLink - 邀请注册链接
 */
export async function sendInviteEmail(toEmail, inviteLink) {
  console.log("the Email is ", toEmail);
  console.log("inviteLink is", inviteLink);
  
  const params = {
    Source: "noreply@emenu.au",
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: "Emenu Waiter Invitation" },
      Body: {
        Html: {
          Data: `
            <p>You are invited to register as a waiter/waiteress, please complete your registration by clicking the link below:</p>
            <a href="${inviteLink}">${inviteLink}</a>
          `
        }
      }
    }
  };
  await sesClient.send(new SendEmailCommand(params));
}
