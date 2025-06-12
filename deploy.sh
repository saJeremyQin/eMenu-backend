
#!/bin/bash
set -e

echo "Zipping lambda..."
cd lambda
zip -r ../lambda.zip .
cd ..

echo "Uploading lambda.zip to s3..."
aws s3 cp lambda.zip s3://emenu-lambda-code-bucket/lambda/lambda.zip

echo "🚀 Updating lambda code..."
aws lambda update-function-code --function-name emenu-server --s3-bucket emenu-lambda-code-bucket --s3-key lambda/lambda.zip