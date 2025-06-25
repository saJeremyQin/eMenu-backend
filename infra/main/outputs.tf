output "emenu_server_url" {
    description = "Http Endpoint of the eMenu server"
    value       = aws_appsync_graphql_api.emenu_apis.uris["GRAPHQL"]
}
