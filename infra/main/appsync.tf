
// Create AppSync graphql apis
resource "aws_appsync_graphql_api" "emenu_apis" {
  authentication_type = "AMAZON_COGNITO_USER_POOLS"
  name                = "emenu-apis"
  schema              = file("${path.module}/schema.graphql")

  user_pool_config {
    user_pool_id   = aws_cognito_user_pool.emenu_user_pool.id
    aws_region     = var.aws_region
    default_action = "ALLOW"
  }

  additional_authentication_provider {
    authentication_type = "API_KEY"
  }
}

// Create API Key for AppSync (for unauthenticated access like registerWaiter)
resource "aws_appsync_api_key" "emenu_api_key" {
  api_id  = aws_appsync_graphql_api.emenu_apis.id
  expires = timeadd(timestamp(), "8760h") // Valid for 1 year (365 days * 24 hours)
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
resource "aws_appsync_resolver" "list_dishes_query" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "listDishes"
  type        = "Query"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/listDishes-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver, mount query to user
resource "aws_appsync_resolver" "get_user_query" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "getUser"
  type        = "Query"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/getUser-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]  
}

// Add resolver for getUserByCognito query
resource "aws_appsync_resolver" "get_user_by_cognito_query" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "getUserByCognito"
  type        = "Query"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/getUserByCognito-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

resource "aws_appsync_resolver" "create_restaurant_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "createRestaurant"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/createRestaurant-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")
  
  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// ==================================================================
// QUERY RESOLVERS
// ==================================================================

// Add resolver for getRestaurant query
resource "aws_appsync_resolver" "get_restaurant_query" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "getRestaurant"
  type        = "Query"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/getRestaurant-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for listDishTypes query
resource "aws_appsync_resolver" "list_dish_types_query" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "listDishTypes"
  type        = "Query"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/listDishTypes-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for listOrders query
resource "aws_appsync_resolver" "list_orders_query" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "listOrders"
  type        = "Query"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/listOrders-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for listWaiters query
resource "aws_appsync_resolver" "list_waiters_query" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "listWaiters"
  type        = "Query"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/listWaiters-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// ==================================================================
// DISH TYPE MUTATION RESOLVERS
// ==================================================================

// Add resolver for createDishType mutation
resource "aws_appsync_resolver" "create_dish_type_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "createDishType"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/createDishType-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for updateDishType mutation
resource "aws_appsync_resolver" "update_dish_type_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "updateDishType"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/updateDishType-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for deleteDishType mutation
resource "aws_appsync_resolver" "delete_dish_type_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "deleteDishType"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/deleteDishType-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// ==================================================================
// DISH MUTATION RESOLVERS
// ==================================================================

// Add resolver for createDish mutation
resource "aws_appsync_resolver" "create_dish_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "createDish"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/createDish-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for updateDish mutation
resource "aws_appsync_resolver" "update_dish_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "updateDish"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/updateDish-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for deleteDish mutation
resource "aws_appsync_resolver" "delete_dish_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "deleteDish"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/deleteDish-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for updateDishAvailability mutation
resource "aws_appsync_resolver" "update_dish_availability_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "updateDishAvailability"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/updateDishAvailability-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// ==================================================================
// ORDER MUTATION RESOLVERS
// ==================================================================

// Add resolver for placeOrder mutation
resource "aws_appsync_resolver" "place_order_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "placeOrder"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/placeOrder-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for checkoutOrder mutation
resource "aws_appsync_resolver" "checkout_order_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "checkoutOrder"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/checkoutOrder-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for updateOrderStatus mutation
resource "aws_appsync_resolver" "update_order_status_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "updateOrderStatus"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/updateOrderStatus-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// ==================================================================
// FIELD RESOLVERS (TYPE FIELDS)
// ==================================================================

// Add resolver for Dish.dishType field
resource "aws_appsync_resolver" "dish_dishType_field" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "dishType"
  type        = "Dish"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/dishType-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// ==================================================================
// RESTAURANT MANAGEMENT RESOLVERS
// ==================================================================

// Add resolver for updateRestaurantInfo mutation
resource "aws_appsync_resolver" "update_restaurant_info_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "updateRestaurantInfo"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/updateRestaurantInfo-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for updateRestaurantSubscriptionPlan mutation
resource "aws_appsync_resolver" "update_restaurant_subscription_plan_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "updateRestaurantSubscriptionPlan"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/updateRestaurantSubscriptionPlan-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

// Add resolver for inviteWaiter mutation
resource "aws_appsync_resolver" "invite_waiter_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "inviteWaiter"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/inviteWaiter-request.vtl")
  response_template = file("${path.module}/mapping-templates/common-response.vtl")

  depends_on = [aws_appsync_graphql_api.emenu_apis]
}

resource "aws_appsync_resolver" "register_waiter_mutation" {
  api_id      = aws_appsync_graphql_api.emenu_apis.id
  field       = "registerWaiter"
  type        = "Mutation"
  data_source = aws_appsync_datasource.emenu_datasource.name

  request_template  = file("${path.module}/mapping-templates/registerWaiter-request.vtl")
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
