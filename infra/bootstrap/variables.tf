variable "environment" {
  description = "dev or prod"
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "account_id" {
  description = "The AWS account this environment lives in. Guards against applying to the wrong account."
  type        = string
}

variable "region" {
  type    = string
  default = "ap-southeast-2"
}

variable "github_owner" {
  type    = string
  default = "saJeremyQin"
}

variable "backend_repo" {
  type    = string
  default = "eMenu-backend"
}

variable "admin_repo" {
  type    = string
  default = "eMenu-admin"
}

variable "create_plan_role" {
  description = "Create the read-only role that pull-request plans use. Only dev: PRs never touch prod."
  type        = bool
  default     = false
}
