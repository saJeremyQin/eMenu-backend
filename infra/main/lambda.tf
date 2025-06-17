
// Look up the bucket created in bootstrap
data "aws_s3_bucket" "lambda_code" {
    bucket = "emenu-lambda-code-bucket"
}

// Create a lambda function
resource "aws_lambda_function" "emenu_server" {
  function_name = "emenu-server"
  s3_bucket     = data.aws_s3_bucket.lambda_code.id
  s3_key        = "lambda/lambda.zip"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  role          = aws_iam_role.lambda_exec.arn
  timeout       = 13

  environment {
    variables = {
      DB_HOST = var.db_host
    }
  }

  # source_code_hash = filebase64sha256("../../lambda.zip")
}

// Create the execution role
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

// Create the basic exectuion policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
    role       = aws_iam_role.lambda_exec.name
    policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"

}
