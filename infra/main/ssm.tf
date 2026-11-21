
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