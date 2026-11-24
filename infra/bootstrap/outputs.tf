output "state_bucket" {
  description = "Use in backend-<env>.hcl of the backend and admin stacks"
  value       = local.state_bucket_name
}

output "lambda_code_bucket" {
  value = aws_s3_bucket.lambda_code.bucket
}

output "backend_deploy_role_arn" {
  description = "GitHub secret AWS_ROLE_ARN in the eMenu-backend <env> Environment"
  value       = aws_iam_role.deploy["backend"].arn
}

output "admin_deploy_role_arn" {
  description = "GitHub secret AWS_ROLE_ARN in the eMenu-admin <env> Environment"
  value       = aws_iam_role.deploy["admin"].arn
}

output "plan_role_arn" {
  description = "GitHub repository secret AWS_PLAN_ROLE_ARN (dev only)"
  value       = var.create_plan_role ? aws_iam_role.plan[0].arn : null
}
