resource "aws_cognito_user_pool" "emenu_user_pool" {
  name = "emenu-user-pool"
  # alias_attributes  = [ "email" ]
  username_attributes = ["email"] # 表示直接用 email 作为 username

  mfa_configuration        = "OFF"
  auto_verified_attributes = ["email"]

  account_recovery_setting { // when forgot password, can be found through verified email
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  password_policy {
    minimum_length    = 6
    require_lowercase = false
    require_uppercase = true
    require_numbers   = false
    require_symbols   = false
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  # var.cognito_email = null -> Cognito's built-in sender; otherwise this account's SES.
  email_configuration {
    email_sending_account = var.cognito_email == null ? "COGNITO_DEFAULT" : "DEVELOPER"
    from_email_address    = var.cognito_email == null ? null : var.cognito_email.from
    source_arn            = var.cognito_email == null ? null : "arn:aws:ses:${var.aws_region}:${var.account_id}:identity/${var.cognito_email.ses_identity}"
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_message        = "Your verfication code is {####}"
    email_subject        = "eMenu Admin registration code"
  }

  lambda_config {
    post_confirmation = aws_lambda_function.emenu_post_confirmation.arn
  }

  schema {
    name                = "email"
    required            = true # email 属性现在是注册时必填的
    attribute_data_type = "String"
    mutable             = true
  }


  # schema {
  #     name                = "preferred_username"
  #     attribute_data_type = "String"
  #     mutable             = true
  #     required            = false
  # }                                      // used to set nickname

  tags = {
    environment = var.environment
    project     = "emenu"
  }
}

resource "aws_cognito_user_pool_client" "emenu_web_client" {
  name            = "emenu-web-client"
  user_pool_id    = aws_cognito_user_pool.emenu_user_pool.id
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  supported_identity_providers  = ["COGNITO"]
  prevent_user_existence_errors = "ENABLED"

  callback_urls = ["${var.admin_url}/callback"]
  logout_urls   = ["${var.admin_url}/logout"]
}

resource "aws_cognito_user_pool_client" "emenu_app_client" {
  name         = "emenu-app-client"
  user_pool_id = aws_cognito_user_pool.emenu_user_pool.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  supported_identity_providers  = ["COGNITO"]
  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_user_group" "boss_group" {
  name         = "boss"
  user_pool_id = aws_cognito_user_pool.emenu_user_pool.id
  description  = "boss users"
  precedence   = 1
}

resource "aws_cognito_user_group" "waiter_group" {
  name         = "waiter"
  user_pool_id = aws_cognito_user_pool.emenu_user_pool.id
  description  = "waiter group"
  precedence   = 2
}

resource "aws_cognito_user_group" "demo_group" {
  name         = "demo"
  user_pool_id = aws_cognito_user_pool.emenu_user_pool.id
  description  = "Demo user group"
  precedence   = 3
}
