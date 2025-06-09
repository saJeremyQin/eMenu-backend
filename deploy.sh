
#!/bin/bash
set -e

echo "Zipping lambda..."
cd lambda
zip -r ../lambda.zip .
cd ..

echo "Uploading lambda.zip to s3..."
aws s3 cp lambda.zip s3://emenu-lambda-code-bucket/lambda/lambda.zip

echo "🚀 Running terraform apply..."
cd infra/main
terraform init
terraform apply