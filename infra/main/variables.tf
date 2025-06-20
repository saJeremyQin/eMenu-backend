variable "db_host" {
  description = "MongoDB connection string"
  type        = string
  sensitive   = true
}

variable "api_key_valid_days" {
  type    = number
  default = 30
}

variable "aws_region" {
  default = "ap-southeast-2"
}

locals {
  api_key_valid_seconds = var.api_key_valid_days * 24 * 60 * 60
}