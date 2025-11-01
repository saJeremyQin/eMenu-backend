
// Look up the bucket created in bootstrap
data "aws_s3_bucket" "lambda_code" {
  bucket = "emenu-lambda-code-bucket"
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

  # 使用 S3 对象的 etag 作为 source_code_hash 来检测文件变化
  # 这样 Terraform 就能自动检测到 S3 中文件的变化
  source_code_hash = data.aws_s3_object.layer_code.etag
}

# 获取 S3 中 layer 文件的信息
data "aws_s3_object" "layer_code" {
  bucket = data.aws_s3_bucket.lambda_code.bucket
  key    = "layers/common_models/common_models_layer.zip"
}


# ----------------------------------------------------------
# Lambda: emenu-server (AppSync handler), time out is 30
# ----------------------------------------------------------
resource "aws_lambda_function" "emenu_server" {
  function_name = "emenu-server"
  s3_bucket     = data.aws_s3_bucket.lambda_code.id
  s3_key        = "lambdas/emenu_server/emenu_server.zip"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  role          = aws_iam_role.lambda_exec.arn
  timeout       = 30
  memory_size   = 128
    
  environment {
    variables = {
      DB_PARAM_NAME = aws_ssm_parameter.db_connect_string_param.name       //Pass the name of Parameter
      WAITER_USER_POOL_ID = aws_cognito_user_pool.emenu_user_pool.id       //Cognito User Pool ID for waiter registration
      ENVIRONMENT = var.environment
    }
  }

  layers = [aws_lambda_layer_version.common_mongoose_models.arn]
  
  # 使用 S3 对象的 etag 作为 source_code_hash 来检测文件变化
  source_code_hash = data.aws_s3_object.emenu_server_code.etag
}

# 获取 emenu_server S3 文件的信息
data "aws_s3_object" "emenu_server_code" {
  bucket = data.aws_s3_bucket.lambda_code.bucket
  key    = "lambdas/emenu_server/emenu_server.zip"
}

# ----------------------------------------------------------
# Lambda: emenu_post_confirmation (Cognito PostConfirmation Trigger)
# ----------------------------------------------------------
resource "aws_lambda_function" "emenu_post_confirmation" {
  function_name = "emenu_post_confirmation"
  s3_bucket     =  data.aws_s3_bucket.lambda_code.id
  s3_key        = "lambdas/emenu_post_confirmation/emenu_post_confirmation.zip"

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
  
  # 使用 S3 对象的 etag 作为 source_code_hash 来检测文件变化
  source_code_hash = data.aws_s3_object.emenu_post_confirmation_code.etag
}

# 获取 emenu_post_confirmation S3 文件的信息
data "aws_s3_object" "emenu_post_confirmation_code" {
  bucket = data.aws_s3_bucket.lambda_code.bucket
  key    = "lambdas/emenu_post_confirmation/emenu_post_confirmation.zip"
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

resource "aws_iam_role_policy" "emenu_server_ses_access" {
  name = "emenu_server_ses_access"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ],
        Resource = "arn:aws:ses:ap-southeast-2:205930647566:identity/*"
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

# ----------------------------------------------------------
# Image Processor Lambda Function
# ----------------------------------------------------------

# IAM role for image processor
resource "aws_iam_role" "image_processor_role" {
  name = "image-processor-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "image_processor_policy" {
  name = "image-processor-policy-${var.environment}"
  role = aws_iam_role.image_processor_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.restaurant_assets.arn}/*"
      }
    ]
  })
}

# CloudWatch Log Group for image processor
resource "aws_cloudwatch_log_group" "image_processor_logs" {
  name              = "/aws/lambda/emenu-image-processor-${var.environment}"
  retention_in_days = 14
}

resource "aws_lambda_function" "image_processor" {
  s3_bucket        = data.aws_s3_bucket.lambda_code.bucket
  s3_key          = "lambdas/image_processor/image_processor.zip"
  function_name   = "emenu-image-processor-${var.environment}"
  role           = aws_iam_role.image_processor_role.arn
  handler        = "index.handler"
  runtime        = "nodejs20.x"
  timeout        = 60
  memory_size    = 512

  environment {
    variables = {
      S3_BUCKET = aws_s3_bucket.restaurant_assets.bucket
    }
  }

  # 使用 S3 对象的 etag 作为 source_code_hash 来检测文件变化
  source_code_hash = data.aws_s3_object.image_processor_code.etag

  depends_on = [
    aws_iam_role_policy.image_processor_policy,
    aws_cloudwatch_log_group.image_processor_logs
  ]
}

# 获取 image_processor S3 文件的信息
data "aws_s3_object" "image_processor_code" {
  bucket = data.aws_s3_bucket.lambda_code.bucket
  key    = "lambdas/image_processor/image_processor.zip"
}

# Lambda permission for S3 to invoke image processor
resource "aws_lambda_permission" "allow_s3_invoke" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.image_processor.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.restaurant_assets.arn
}

# S3 bucket notification to trigger image processing
resource "aws_s3_bucket_notification" "image_upload_notification" {
  bucket = aws_s3_bucket.restaurant_assets.id

  # Handle uploads from presigned URL (now uses User Pool sub in path)
  lambda_function {
    lambda_function_arn = aws_lambda_function.image_processor.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "public/restaurant-logos/"
    filter_suffix       = ".jpeg"
  }
  
  lambda_function {
    lambda_function_arn = aws_lambda_function.image_processor.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "public/restaurant-logos/"
    filter_suffix       = ".jpg"
  }
  
  lambda_function {
    lambda_function_arn = aws_lambda_function.image_processor.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "public/restaurant-logos/"
    filter_suffix       = ".png"
  }

  depends_on = [aws_lambda_permission.allow_s3_invoke]
}

# ----------------------------------------------------------
# Presigned URL Generator Lambda Function
# ----------------------------------------------------------

# IAM role for presigned URL generator
resource "aws_iam_role" "presigned_url_role" {
  name = "presigned-url-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "presigned_url_policy" {
  name = "presigned-url-policy-${var.environment}"
  role = aws_iam_role.presigned_url_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${aws_s3_bucket.restaurant_assets.arn}/public/restaurant-logos/*"
      }
    ]
  })
}

# CloudWatch Log Group for presigned URL generator
resource "aws_cloudwatch_log_group" "presigned_url_generator_logs" {
  name              = "/aws/lambda/emenu-presigned-url-generator-${var.environment}"
  retention_in_days = 14
}

# Presigned URL Generator Lambda Function
resource "aws_lambda_function" "presigned_url_generator" {
  s3_bucket        = data.aws_s3_bucket.lambda_code.bucket
  s3_key          = "lambdas/presigned_url_generator/presigned_url_generator.zip"
  function_name   = "emenu-presigned-url-generator-${var.environment}"
  role           = aws_iam_role.presigned_url_role.arn
  handler        = "index.handler"
  runtime        = "nodejs18.x"
  timeout        = 30

  environment {
    variables = {
      S3_BUCKET = aws_s3_bucket.restaurant_assets.bucket
    }
  }

  # 使用 S3 对象的 etag 作为 source_code_hash 来检测文件变化
  source_code_hash = data.aws_s3_object.presigned_url_generator_code.etag

  depends_on = [
    aws_iam_role_policy.presigned_url_policy,
    aws_cloudwatch_log_group.presigned_url_generator_logs
  ]
}

# 获取 presigned_url_generator S3 文件的信息
data "aws_s3_object" "presigned_url_generator_code" {
  bucket = data.aws_s3_bucket.lambda_code.bucket
  key    = "lambdas/presigned_url_generator/presigned_url_generator.zip"
}

# Lambda Function URL for presigned URL generator
resource "aws_lambda_function_url" "presigned_url_generator" {
  function_name      = aws_lambda_function.presigned_url_generator.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "HEAD", "PATCH"]
    allow_headers     = [
      "authorization",
      "content-type", 
      "date",
      "keep-alive"
    ]
    expose_headers    = ["date", "keep-alive"]
    max_age          = 86400
  }
}
