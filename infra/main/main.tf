provider "aws" {
  region = "ap-southeast-2"
}

resource "aws_s3_bucket" "lambda_bucket" {
  bucket = "emenu-lambda-code-bucket"
}

resource "aws_iam_role" "lambda_exec" {
  name = "emenu_lambda_exec"
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

resource "aws_lambda_function" "emenu-server" {
  function_name = "emenu-server"
  s3_bucket     = aws_s3_bucket.lambda_bucket.id
  s3_key        = "lambda/lambda.zip"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  role          = aws_iam_role.lambda_exec.arn

  environment {
    variables = {
      DB_HOST = var.db_host
    }
  }

  source_code_hash = filebase64sha256("../lambda.zip")
}
