
// Create AppSync graphql apis
resource "aws_appsync_graphql_api" "emenu_apis" {
  # authentication_type = "API_KEY"
  authentication_type = "AMAZON_COGNITO_USER_POOLS"
  name                = "emenu-apis"
  schema              = file("${path.module}/schema.graphql")

  user_pool_config {
    user_pool_id   = "ap-southeast-2_0a2hzDvRi"
    aws_region     = var.aws_region
    default_action = "ALLOW"
  }
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
    
  // depends on the update of schema
  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver, mount query to dishes
# resource "aws_appsync_resolver" "list_dishes_query" {
#   api_id      = aws_appsync_graphql_api.emenu_apis.id
#   field       = "listDishes"
#   type        = "Query"
#   data_source = aws_appsync_datasource.emenu_datasource.name

#   request_template  = file("${path.module}/mapping-templates/listDishes-request.vtl")
#   response_template = file("${path.module}/mapping-templates/common-response.vtl")

#   depends_on = [aws_appsync_graphql_api.emenu_apis]
# }

resource "aws_appsync_resolver" "create_restaurant_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "createRestaurant"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/createRestaurant-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")
  
  depends_on = [aws_appsync_graphql_api.emenu_apis]
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
