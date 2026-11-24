# GitHub Actions OIDC provider. One per account.
# In dev it already exists and is imported (see README.md).
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS validates GitHub's certificate against its own trusted CAs and no longer uses
  # these values, but the API still accepts them. Ignore drift on them.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]

  lifecycle {
    ignore_changes = [thumbprint_list]
  }
}
