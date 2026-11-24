locals {
  oidc_host = "token.actions.githubusercontent.com"

  # Deploy roles trust only jobs that run in the matching GitHub Environment.
  # The prod Environment needs your approval and only allows the master branch.
  deploy_roles = {
    backend = {
      name = "gha-emenu-backend-${var.environment}"
      sub  = "repo:${var.github_owner}/${var.backend_repo}:environment:${var.environment}"
    }
    admin = {
      name = "gha-emenu-admin-${var.environment}"
      sub  = "repo:${var.github_owner}/${var.admin_repo}:environment:${var.environment}"
    }
  }
}

data "aws_iam_policy_document" "deploy_trust" {
  for_each = local.deploy_roles

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = [each.value.sub]
    }
  }
}

resource "aws_iam_role" "deploy" {
  for_each = local.deploy_roles

  name                 = each.value.name
  description          = "GitHub Actions deploy role for ${each.key} (${var.environment})"
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust[each.key].json
  max_session_duration = 3600
}

# Broad on purpose while the stacks are still changing. Narrow to the services
# actually used (Lambda, AppSync, Cognito, S3, IAM, ECS, ECR, ELB, ...) after launch.
resource "aws_iam_role_policy_attachment" "deploy_admin" {
  for_each = local.deploy_roles

  role       = aws_iam_role.deploy[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ----------------------------------------------------------------------------
# Read-only role for `terraform plan` on pull requests (dev only).
# GitHub doesn't issue OIDC tokens to PRs from forks, so only PRs from branches
# in these repos can use it.
# ----------------------------------------------------------------------------
data "aws_iam_policy_document" "plan_trust" {
  count = var.create_plan_role ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values = [
        "repo:${var.github_owner}/${var.backend_repo}:pull_request",
        "repo:${var.github_owner}/${var.admin_repo}:pull_request",
      ]
    }
  }
}

resource "aws_iam_role" "plan" {
  count = var.create_plan_role ? 1 : 0

  name                 = "gha-emenu-plan-${var.environment}"
  description          = "GitHub Actions read-only role for terraform plan on pull requests"
  assume_role_policy   = data.aws_iam_policy_document.plan_trust[0].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  count = var.create_plan_role ? 1 : 0

  role       = aws_iam_role.plan[0].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# Plan reads state and takes the S3 lock (a .tflock object next to the state).
# It may write and delete lock files only, never state.
data "aws_iam_policy_document" "plan_state" {
  count = var.create_plan_role ? 1 : 0

  statement {
    sid       = "ListStateBucket"
    actions   = ["s3:ListBucket"]
    resources = [local.state_bucket_arn]
  }

  statement {
    sid       = "ReadState"
    actions   = ["s3:GetObject"]
    resources = ["${local.state_bucket_arn}/*"]
  }

  statement {
    sid       = "LockFilesOnly"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.state_bucket_arn}/*.tflock"]
  }
}

resource "aws_iam_role_policy" "plan_state" {
  count = var.create_plan_role ? 1 : 0

  name   = "terraform-state-read-and-lock"
  role   = aws_iam_role.plan[0].id
  policy = data.aws_iam_policy_document.plan_state[0].json
}
