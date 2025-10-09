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