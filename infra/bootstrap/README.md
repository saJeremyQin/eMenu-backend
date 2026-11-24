# Bootstrap: per-account foundation

Sets up **one AWS account per environment**. Two parts:

1. **`create-state-bucket.sh`** (by hand, once per account) creates the Terraform state bucket `emenu-tfstate-<env>-<account-id>`. Terraform needs this bucket before it can store state, so Terraform doesn't manage it. All eMenu stacks in the account keep their state there.
2. **This Terraform stack** creates the rest:

| Resource | Name |
|---|---|
| Lambda code bucket | `emenu-lambda-code-<env>-<account-id>` |
| GitHub OIDC provider | `token.actions.githubusercontent.com` |
| Backend deploy role | `gha-emenu-backend-<env>`: trusts `repo:saJeremyQin/eMenu-backend:environment:<env>` |
| Admin deploy role | `gha-emenu-admin-<env>`: trusts `repo:saJeremyQin/eMenu-admin:environment:<env>` |
| PR plan role (dev only) | `gha-emenu-plan-dev`: read-only, trusts `pull_request` in both repos |

| Env | Account | AWS profile | Files |
|---|---|---|---|
| dev | `205930647566` | `emenu` | `dev.tfvars`, `backend-dev.hcl` |
| prod | `471112659065` | `emenu-prod` | `prod.tfvars`, `backend-prod.hcl` |

The provider sets `allowed_account_ids`, so `dev.tfvars` with the prod profile (or the other way round) fails before it changes anything.

This stack is applied **by hand**, never from CI: it creates the roles CI uses.

## First run in an account

```bash
cd infra/bootstrap
export AWS_PROFILE=emenu          # prod: emenu-prod
ENV=dev                           # prod: prod
ACCOUNT=205930647566              # prod: 471112659065

# 1. State bucket (checks the account first; does nothing if it exists)
./create-state-bucket.sh $ENV $ACCOUNT

# 2. Init with the S3 backend
terraform init -backend-config=backend-$ENV.hcl

# 3. Dev only: the GitHub OIDC provider already exists, so import it
terraform import -var-file=dev.tfvars aws_iam_openid_connect_provider.github \
  arn:aws:iam::205930647566:oidc-provider/token.actions.githubusercontent.com

# 4. Review and apply
terraform plan -var-file=$ENV.tfvars -out=tfplan
terraform apply tfplan
```

## Later runs

```bash
terraform init -reconfigure -backend-config=backend-$ENV.hcl
terraform plan -var-file=$ENV.tfvars -out=tfplan
terraform apply tfplan
```

## After applying

Put the role ARNs from `terraform output` into GitHub:

| Secret | Where |
|---|---|
| `AWS_ROLE_ARN` = `backend_deploy_role_arn` | eMenu-backend, Environment `<env>` |
| `AWS_ROLE_ARN` = `admin_deploy_role_arn` | eMenu-admin, Environment `<env>` |
| `AWS_PLAN_ROLE_ARN` = `plan_role_arn` (dev) | repository secret in both repos |

The old buckets (`emenu-terraform-state-bucket`, `emenu-lambda-code-bucket`) and `GITHUB_OIDC_ROLE` are not managed here. They are removed after the backend and admin stacks have moved to the new buckets and pipelines.
