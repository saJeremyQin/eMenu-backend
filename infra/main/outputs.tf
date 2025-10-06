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

# S3 bucket for restaurant assets
output "restaurant_assets_bucket_name" {
  description = "Name of the S3 bucket for restaurant assets"
  value       = aws_s3_bucket.restaurant_assets.bucket
}

output "restaurant_assets_bucket_domain" {
  description = "Domain name of the S3 bucket for restaurant assets"
  value       = aws_s3_bucket.restaurant_assets.bucket_domain_name
}

# Presigned URL generator Lambda URL
output "presigned_url_generator_url" {
  description = "Lambda URL for presigned URL generator"
  value       = aws_lambda_function_url.presigned_url_generator.function_url
}

# Lambda functions
output "presigned_url_generator_function_name" {
  description = "Name of the presigned URL generator Lambda function"
  value       = aws_lambda_function.presigned_url_generator.function_name
}

output "image_processor_function_name" {
  description = "Name of the image processor Lambda function"
  value       = aws_lambda_function.image_processor.function_name
}