locals {
  # The state bucket is created by create-state-bucket.sh, not by Terraform
  # (Terraform needs it before it can store any state). Referenced by name only.
  state_bucket_name       = "emenu-tfstate-${var.environment}-${var.account_id}"
  state_bucket_arn        = "arn:aws:s3:::${local.state_bucket_name}"
  lambda_code_bucket_name = "emenu-lambda-code-${var.environment}-${var.account_id}"
}

# ----------------------------------------------------------------------------
# Lambda and layer zips uploaded by the backend pipeline
# ----------------------------------------------------------------------------
resource "aws_s3_bucket" "lambda_code" {
  bucket = local.lambda_code_bucket_name
}

resource "aws_s3_bucket_versioning" "lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "lambda_code" {
  bucket                  = aws_s3_bucket.lambda_code.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Keep a few previous zips per function for rollback.
resource "aws_s3_bucket_lifecycle_configuration" "lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id

  rule {
    id     = "expire-old-lambda-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days           = 30
      newer_noncurrent_versions = 5
    }
  }

  depends_on = [aws_s3_bucket_versioning.lambda_code]
}

resource "aws_s3_bucket_policy" "lambda_code" {
  bucket = aws_s3_bucket.lambda_code.id
  policy = data.aws_iam_policy_document.lambda_code_tls_only.json

  depends_on = [aws_s3_bucket_public_access_block.lambda_code]
}

data "aws_iam_policy_document" "lambda_code_tls_only" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.lambda_code.arn, "${aws_s3_bucket.lambda_code.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
