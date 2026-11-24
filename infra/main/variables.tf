variable "environment" {
  description = "dev or prod"
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "account_id" {
  description = "AWS account of this environment. The provider refuses any other account."
  type        = string
}

variable "aws_region" {
  type    = string
  default = "ap-southeast-2"
}

variable "admin_url" {
  description = "Base URL of the admin site: Cognito callback/logout URLs and waiter invite links"
  type        = string
}

variable "cognito_email" {
  description = <<-EOT
    How Cognito sends verification emails.
    null = Cognito's built-in sender (low daily limit, fine until SES is set up).
    Otherwise send through this account's SES: `from` address and the verified SES `ses_identity`
    (an email address or a domain such as emenu.au).
  EOT
  type = object({
    from         = string
    ses_identity = string
  })
  default = null
}

variable "invite_from_email" {
  description = "Sender of waiter invite emails (must be verified in this account's SES)"
  type        = string
}
