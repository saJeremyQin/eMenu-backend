
// This is for Parameter Store of System Manager

// Encrypt with the AWS managed SSM key (no extra cost, nothing to delete by mistake).
data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

resource "aws_ssm_parameter" "db_connect_string_param" {
  name        = "/emenu/${var.environment}/db_connection_string"
  type        = "SecureString"
  description = "The connection string of MongoDB for eMenu"
  key_id      = data.aws_kms_alias.ssm.name
  value       = "placeholder_db_connection_string_DO_NOT_USE"

  lifecycle {
    ignore_changes = [value]
  }
}
# Admin (web) app client ID, read by the post-confirmation Lambda to decide who becomes a boss.
# The Lambda and its IAM policy use local.web_client_id_param (a plain string), not this
# resource: the user pool already depends on the Lambda (lambda_config), so referencing the
# client here would create a dependency cycle.
locals {
  web_client_id_param = "/emenu/${var.environment}/web_client_id"
}

resource "aws_ssm_parameter" "web_client_id" {
  name        = local.web_client_id_param
  type        = "String"
  description = "Cognito app client ID of the eMenu admin site (sign-ups from it become boss)"
  value       = aws_cognito_user_pool_client.emenu_web_client.id
}
