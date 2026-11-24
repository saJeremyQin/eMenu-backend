# Per-account foundation for eMenu: Terraform state bucket, Lambda code bucket,
# GitHub OIDC provider and the CI roles. Applied by hand, once per account:
#   dev:  AWS_PROFILE=emenu       -var-file=dev.tfvars   -backend-config=backend-dev.hcl
#   prod: AWS_PROFILE=emenu-prod  -var-file=prod.tfvars  -backend-config=backend-prod.hcl
# See README.md for the first run, when the state bucket doesn't exist yet.

terraform {
  required_version = ">= 1.10" # S3 native locking (use_lockfile)

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.73" # same as infra/main and eMenu-admin
    }
  }

  # Partial config: bucket and key come from backend-<env>.hcl.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  # Refuse to run against the wrong account (e.g. dev.tfvars with the prod profile).
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      Project     = "emenu"
      Environment = var.environment
      ManagedBy   = "terraform"
      Stack       = "bootstrap"
    }
  }
}
