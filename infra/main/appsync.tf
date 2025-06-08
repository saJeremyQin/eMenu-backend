
// Create AppSync graphql apis
resource "aws_appsync_graphql_api" "emenu_apis" {
  authentication_type = "API_KEY"
  name                = "emenu-apis"
  schema              = file("${path.module}/schema.graphql")
}

// Create API_KEY resoure
resource "aws_appsync_api_key" "emenu_api_key" {
  api_id  = aws_appsync_graphql_api.emenu_apis.id
  description = "Managed by Terraform"
  expires = timeadd(timestamp(), "${local.api_key_valid_seconds}s")
}

// Configure the lambda function as a datasource for AppSync apis
resource "aws_appsync_datasource" "emenu_datasource" {
  api_id           = aws_appsync_graphql_api.emenu_apis.id
  name             = "emenu_datasource"
  service_role_arn = aws_iam_role.appsync_lambda_role.arn
  type             = "AWS_LAMBDA"

  lambda_config {
    function_arn = aws_lambda_function.emenu_server.arn
  }
}

// Add resolver, mount query to dishes
resource "aws_appsync_resolver" "dishes_query" {
    api_id      = aws_appsync_graphql_api.emenu_apis.id
    field       = "dishes"
    type        = "Query"
    data_source = aws_appsync_datasource.emenu_datasource.name

    request_template  = file("${path.module}/mapping-templates/dishes-request.vtl")
    response_template = file("${path.module}/mapping-templates/dishes-response.vtl")
}

// Create a role for AppSync to invoke lambda
resource "aws_iam_role" "appsync_lambda_role" {
    name = "appsync-lambda-invoke-role"
    assume_role_policy = jsonencode({
        Version = "2012-10-17",
        Statement = [
            {
                Effect = "Allow",
                Principal = {
                    Service = "appsync.amazonaws.com"
                },
                Action = "sts:AssumeRole"
            }
        ]
    })
}

resource "aws_iam_role_policy" "appsync_invoke_lambda" {
    name = "appsync-invoke-lambda"
    role = aws_iam_role.appsync_lambda_role.id

    policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "lambda:InvokeFunction"
        ],
        Resource = aws_lambda_function.emenu_server.arn
      }
    ]
  })
}
