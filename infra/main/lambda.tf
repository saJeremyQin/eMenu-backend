
// Look up the bucket created in bootstrap
data "aws_s3_bucket" "lambda_code" {
    bucket = "emenu-lambda-code-bucket"
}

data "aws_s3_object" "lambda_layer" {
  bucket = data.aws_s3_bucket.lambda_code.id
  key    = "layers/common_models/common_models_layer.zip"
}

# --------------------------------------------------------------------------
# Lambda Layer for Common Mongoose Models, managed by Terraform
# --------------------------------------------------------------------------
resource "aws_lambda_layer_version" "common_mongoose_models" {
  layer_name          = "common-mongoose-models"
  description         = "The shared mongoose models for eMenu lambdas"
  s3_bucket           = data.aws_s3_bucket.lambda_code.id
  s3_key              = "layers/common_models/common_models_layer.zip"
  compatible_runtimes = ["nodejs20.x"]

  source_code_hash = data.aws_s3_object.lambda_layer.etag
}


# ----------------------------------------------------------
# Lambda: emenu-server (AppSync handler), time out is 30
# ----------------------------------------------------------
resource "aws_lambda_function" "emenu_server" {
  function_name = "emenu-server"
  s3_bucket     = data.aws_s3_bucket.lambda_code.id
  s3_key        = "lambdas/emenu_server/appsync_main_handler.zip"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  role          = aws_iam_role.lambda_exec.arn
  timeout       = 30
  memory_size   = 128
    
  environment {
    variables = {
      DB_PARAM_NAME = aws_ssm_parameter.db_connect_string_param.name       //Pass the name of Parameter
    }
  }

  layers = [aws_lambda_layer_version.common_mongoose_models.arn]
  # source_code_hash = filebase64sha256("../../lambda.zip")
}

# ----------------------------------------------------------
# Lambda: emenu_post_confirmation (Cognito PostConfirmation Trigger)
# ----------------------------------------------------------
resource "aws_lambda_function" "emenu_post_confirmation" {
  function_name = "emenu_post_confirmation"
  s3_bucket     =  data.aws_s3_bucket.lambda_code.id
  s3_key        = "lambdas/emenu_post_confirmation/cognito_trigger.zip"

  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 128

  role = aws_iam_role.cognito_trigger.arn

  environment {
    variables = {
      DB_PARAM_NAME = aws_ssm_parameter.db_connect_string_param.name       //Pass the name of Parameter
    }
  }

  layers = [aws_lambda_layer_version.common_mongoose_models.arn]
}

// add permission, allow cognito user pool to invoke emenu_post_confirmation
resource "aws_lambda_permission" "allow_cognito_user_pool" {
  statement_id  = "AllowExecutionFromCognitoUserPool"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.emenu_post_confirmation.function_name
  principal     = "cognito-idp.amazonaws.com"

  source_arn = aws_cognito_user_pool.emenu_user_pool.arn
}
# Role for emenu-server
resource "aws_iam_role" "lambda_exec" {
  name = "emenu_lambda_exec_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role" "cognito_trigger" {
  name = "emenu_cognito_post_confirmation_role"

  assume_role_policy = jsonencode(
    {
      Version = "2012-10-17",
      Statement = [{
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }]
    }
  )
}

// Create the basic exectuion policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

// add the basic lambda exectuion privillage to cognito_trigger
resource "aws_iam_role_policy_attachment" "cognito_lambda_execution" {
  role = aws_iam_role.cognito_trigger.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" 
}

// add the 'AdminAddUserToGroup' to cognito_trigger
resource "aws_iam_role_policy" "cognito_admin_group_access" {
  name = "AllowCognitoAdminGroupAccess"
  role = aws_iam_role.cognito_trigger.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "cognito-idp:AdminAddUserToGroup"
        ],
        # Resource = "arn:aws:cognito-idp:ap-southeast-2:205930647566:userpool/ap-southeast-2_0a2hzDvRi"
        Resource = aws_cognito_user_pool.emenu_user_pool.arn
      }
    ]
  })
}

// Add the ssm getParameter previliedge for lambda_exec role of emenu_server
resource "aws_iam_role_policy" "emenu_server_ssm_access" {
  name = "emenu_server_ssm_access"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",          // Optional when need retrieve multi parameters under pathe
        ],
        Resource = aws_ssm_parameter.db_connect_string_param.arn
      },
      {
        Effect = "Allow",
        Action = [
          "kms:Decrypt"
        ], 
        Resource = "arn:aws:kms:ap-southeast-2:205930647566:key/9699535c-75c7-4ba3-96bb-2848475b1eda"
      }
    ]
  }) 
}

resource "aws_iam_role_policy" "emenu_post_confirmation_ssm_access" {
  name = "emenu_post_confirmation_ssm_access"
  role = aws_iam_role.cognito_trigger.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",          // Optional when need retrieve multi parameters under pathe
          "kms:Decrypt"                       // Only useful for SecureString
        ],
               Resource = aws_ssm_parameter.db_connect_string_param.arn
      },
      {
        Effect = "Allow",
        Action = [
          "kms:Decrypt"
        ], 
        Resource = "arn:aws:kms:ap-southeast-2:205930647566:key/9699535c-75c7-4ba3-96bb-2848475b1eda"
      }
    ]
  }) 
}