output "emenu_server_url" {
    description = "Http Endpoint of the eMenu server"
    value       = aws_appsync_graphql_api.emenu_apis.uris["GRAPHQL"]
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.emenu_user_pool.id
}

output "cognito_user_pool_web_client_id" {
  value = aws_cognito_user_pool_client.emenu_web_client.id
}

output "cognito_user_pool_app_client_id" {
  value = aws_cognito_user_pool_client.emenu_app_client.id
}