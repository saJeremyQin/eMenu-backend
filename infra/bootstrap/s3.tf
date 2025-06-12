
// s3 bucket for terraform state
resource "aws_s3_bucket" "tf_state" {
    bucket        = "emenu-terraform-state-bucket"
    force_destroy = true
}

// Enable versioning for tf_state bucket
resource "aws_s3_bucket_versioning" "versioning_tf_state" {
    bucket = aws_s3_bucket.tf_state.id
    versioning_configuration {
      status = "Enabled"
    }
}

// Enable SSE-S3 encryption for tf_state bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "secure_tf_state" {
    bucket = aws_s3_bucket.tf_state.id

    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
}

// S3 bucket for lambda code zip
resource "aws_s3_bucket" "lambda_code" {
    bucket        = "emenu-lambda-code-bucket"
    force_destroy = true
}

// Enable versioning for Lambda code bucket
resource "aws_s3_bucket_versioning" "versioning_lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id

  versioning_configuration {
    status = "Enabled"
  }
}

// Enable SSE-S3 encryption for Lambda code bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "secure_lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}