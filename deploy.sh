#!/bin/bash
set -e

# 设置环境变量
S3_BUCKET="emenu-lambda-code-bucket"
REGION="ap-southeast-2"

echo "📦 Install Layer dependencies..."
cd lambdas/layers/common_models/nodejs
npm install
cd ../../../..

echo "📦 Package Layer zip..."
cd lambdas/layers/common_models
zip -r common_models_layer.zip nodejs
cd ../../..

echo "🚀 Uploda Layer to S3..."
aws s3 cp lambdas/layers/common_models/common_models_layer.zip s3://$S3_BUCKET/layers/common_models/common_models_layer.zip --region $REGION

echo "📦 Install emenu_server dependencies..."
cd lambdas/emenu_server
npm install
cd ../..

echo "📦 Package emenu_server zip..."
cd lambdas/emenu_server
zip -r appsync_main_handler.zip .
cd ../..

echo "🚀 Upload emenu_server to S3..."
aws s3 cp lambdas/emenu_server/appsync_main_handler.zip s3://$S3_BUCKET/lambdas/emenu_server/appsync_main_handler.zip --region $REGION

echo "📦 Install emenu_post_confirmation 依赖..."
cd lambdas/emenu_post_confirmation
npm install
cd ../..

echo "📦 Package emenu_post_confirmation zip..."
cd lambdas/emenu_post_confirmation
zip -r cognito_trigger.zip .
cd ../..

echo "🚀 Upload emenu_post_confirmation to S3..."
aws s3 cp lambdas/emenu_post_confirmation/cognito_trigger.zip s3://$S3_BUCKET/lambdas/emenu_post_confirmation/cognito_trigger.zip --region $REGION

echo "✅ All Lambda and Layer uploaded!"
