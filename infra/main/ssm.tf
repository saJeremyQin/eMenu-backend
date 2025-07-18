
// This is for Parameter Store of System Manager
resource "aws_ssm_parameter" "db_connect_string_param" {
    name = "/emenu/${var.environment}/db_connection_string"
    type = "SecureString"
    description = "The connection string of MongoDB for eMenu"
    key_id = "arn:aws:kms:ap-southeast-2:205930647566:key/9699535c-75c7-4ba3-96bb-2848475b1eda"
    value = "placeholder_db_connection_string_DO_NOT_USE"
}