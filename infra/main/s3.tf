# S3 bucket for restaurant assets
resource "aws_s3_bucket" "restaurant_assets" {
  bucket = "emenu-restaurant-assets-${var.environment}"

  tags = {
    Name        = "Restaurant Assets"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "restaurant_assets_versioning" {
  bucket = aws_s3_bucket.restaurant_assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "restaurant_assets_encryption" {
  bucket = aws_s3_bucket.restaurant_assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "restaurant_assets_cors" {
  bucket = aws_s3_bucket.restaurant_assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_public_access_block" "restaurant_assets_pab" {
  bucket = aws_s3_bucket.restaurant_assets.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "restaurant_assets_policy" {
  bucket = aws_s3_bucket.restaurant_assets.id
  depends_on = [aws_s3_bucket_public_access_block.restaurant_assets_pab]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.restaurant_assets.arn}/public/*"
      },
      {
        Sid       = "PublicReadProcessedImages"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.restaurant_assets.arn}/public/restaurant-logos/processed/*"
      },
      {
        Sid    = "AuthenticatedUserUpload"
        Effect = "Allow"
        Principal = "*"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${aws_s3_bucket.restaurant_assets.arn}/public/restaurant-logos/*"
      }
    ]
  })
}

# Lambda function for image processing
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

resource "aws_lambda_function" "image_processor" {
  s3_bucket        = aws_s3_bucket.lambda_artifacts.bucket
  s3_key          = aws_s3_object.image_processor_zip.key
  function_name   = "emenu-image-processor-${var.environment}"
  role           = aws_iam_role.image_processor_role.arn
  handler        = "index.handler"
  runtime        = "nodejs20.x"
  timeout        = 60
  memory_size    = 512

  environment {
    variables = {
      S3_BUCKET = aws_s3_bucket.restaurant_assets.bucket
      AWS_REGION = var.aws_region
    }
  }

  depends_on = [
    aws_iam_role_policy.image_processor_policy,
    aws_cloudwatch_log_group.image_processor_logs
  ]
}

# S3 object for image processor
resource "aws_s3_object" "image_processor_zip" {
  bucket = aws_s3_bucket.lambda_artifacts.bucket
  key    = "image_processor.zip"
  source = "${path.root}/../../lambdas/image_processor/image_processor.zip"
  etag   = filemd5("${path.root}/../../lambdas/image_processor/image_processor.zip")
}

# CloudWatch Log Group for image processor
resource "aws_cloudwatch_log_group" "image_processor_logs" {
  name              = "/aws/lambda/emenu-image-processor-${var.environment}"
  retention_in_days = 14
}

# Presigned URL Generator Lambda Function
resource "aws_lambda_function" "presigned_url_generator" {
  s3_bucket        = aws_s3_bucket.lambda_artifacts.bucket
  s3_key          = aws_s3_object.presigned_url_generator_zip.key
  function_name   = "emenu-presigned-url-generator-${var.environment}"
  role           = aws_iam_role.presigned_url_role.arn
  handler        = "index.handler"
  runtime        = "nodejs18.x"
  timeout        = 30

  environment {
    variables = {
      S3_BUCKET = aws_s3_bucket.restaurant_assets.bucket
      AWS_REGION = var.aws_region
    }
  }

  depends_on = [
    aws_iam_role_policy.presigned_url_policy,
    aws_cloudwatch_log_group.presigned_url_generator_logs
  ]
}

# S3 object for presigned URL generator
resource "aws_s3_object" "presigned_url_generator_zip" {
  bucket = aws_s3_bucket.lambda_artifacts.bucket
  key    = "presigned_url_generator.zip"
  source = "${path.root}/../../lambdas/presigned_url_generator/presigned_url_generator.zip"
  etag   = filemd5("${path.root}/../../lambdas/presigned_url_generator/presigned_url_generator.zip")
}

# CloudWatch Log Group for presigned URL generator
resource "aws_cloudwatch_log_group" "presigned_url_generator_logs" {
  name              = "/aws/lambda/emenu-presigned-url-generator-${var.environment}"
  retention_in_days = 14
}

# Lambda Function URL for presigned URL generator
resource "aws_lambda_function_url" "presigned_url_generator" {
  function_name      = aws_lambda_function.presigned_url_generator.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["POST"]
    allow_headers     = ["date", "keep-alive", "content-type", "authorization"]
    expose_headers    = ["date", "keep-alive"]
    max_age          = 86400
  }
}

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

# Lambda permission for S3 to invoke image processor
resource "aws_lambda_permission" "allow_s3_invoke" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.image_processor.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.restaurant_assets.arn
}

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

# Store bucket name in SSM for application access
resource "aws_ssm_parameter" "s3_bucket_name" {
  name        = "/emenu-admin/${var.environment}/s3_bucket_name"
  description = "S3 Bucket name for restaurant assets"
  type        = "String"
  value       = aws_s3_bucket.restaurant_assets.bucket
  overwrite   = true

  tags = {
    Environment = var.environment
  }
}