output "emenu_server_url" {
    description = "Http Endpoint of the eMenu server"
    value       = aws_appsync_graphql_api.emenu_apis.uris["GRAPHQL"]
}

output "emenu_api_key" {
    description = "api key for client access"
    value = aws_appsync_api_key.emenu_api_key.id
}