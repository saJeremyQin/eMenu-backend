
// enable use_lockfile to avoid state file being applied at the same tim
terraform {
  required_version = ">= 1.10" # S3 native locking (use_lockfile)

  # Same constraint in infra/bootstrap and eMenu-admin; .terraform.lock.hcl pins 6.73.0.
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.73"
    }
  }

  # Partial config: bucket and key come from backend-<env>.hcl
  #   terraform init -backend-config=backend-dev.hcl
  backend "s3" {}
}

// set region
provider "aws" {
  region = var.aws_region
}
