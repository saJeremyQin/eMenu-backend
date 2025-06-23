#!/bin/bash
set -e

S3_BUCKET="emenu-lambda-code-bucket"
REGION="ap-southeast-2"

echo "--- Building and Deploying Lambda Layers and Functions ---"

# --- Layer: common_models ---
LAYER_DIR="lambdas/layers/common_models"
LAYER_ZIP="common_models_layer.zip"
LAYER_S3_KEY="layers/common_models/${LAYER_ZIP}"   # This S3 key is managed by Terraform for Layer versioning

echo "📦 Installing Layer dependencies..."
(cd "$LAYER_DIR/nodejs" && npm install)

echo "📦 Packaging Layer zip from ${Layer_Dir}..."
(cd "$LAYER_DIR" && zip -r "$LAYER_ZIP" nodejs)

echo "🚀 Uploda Layer to S3: s3://${S3_BUCKET}/${LAYER_S3_KEY}..."
aws s3 cp "${LAYER_DIR}/${LAYER_ZIP}" "s3://${S3_BUCKET}/${LAYER_S3_KEY}" --region "$REGION"

# --- Function: emenu_server ---
SERVER_DIR="lambdas/emenu_server"
SERVER_ZIP="appsync_main_handler.zip"
SERVER_S3_KEY="lambdas/emenu_server/${SERVER_ZIP}"
SERVER_FUNCTION_NAME="emenu-server" # Lambda function name

echo "📦 Installing emenu_server dependencies in ${SERVER_DIR}..."
(cd "$SERVER_DIR" && npm install)

echo "📦 Packaging emenu_server zip from ${SERVER_DIR}..."
(cd "$SERVER_DIR" && zip -r "$SERVER_ZIP" .) # packaing all the files, including index.mjs

echo "🚀 Uploading emenu_server to S3: s3://${S3_BUCKET}/${SERVER_S3_KEY}..."
aws s3 cp "${SERVER_DIR}/${SERVER_ZIP}" "s3://${S3_BUCKET}/${SERVER_S3_KEY}" --region "$REGION"

echo "🔄 Updating Lambda function code for ${SERVER_FUNCTION_NAME}..."
aws lambda update-function-code \
    --function-name "${SERVER_FUNCTION_NAME}" \
    --s3-bucket "${S3_BUCKET}" \
    --s3-key "${SERVER_S3_KEY}" \
    --region "$REGION" \
    --no-cli-pager

# --- Function: emenu_post_confirmation ---
POST_CONF_DIR="lambdas/emenu_post_confirmation"
POST_CONF_ZIP="cognito_trigger.zip"
POST_CONF_S3_KEY="lambdas/emenu_post_confirmation/${POST_CONF_ZIP}"
POST_CONF_FUNCTION_NAME="emenu_post_confirmation" # Lambda function name

echo "📦 Installing emenu_post_confirmation dependencies in ${POST_CONF_DIR}..."
(cd "$POST_CONF_DIR" && npm install )

echo "📦 Packaging emenu_post_confirmation zip from ${POST_CONF_DIR}..."
(cd "$POST_CONF_DIR" && zip -r "$POST_CONF_ZIP" .) # packaging all the files, including index.mjs

echo "🚀 Uploading emenu_post_confirmation code to S3: s3://${S3_BUCKET}/${POST_CONF_S3_KEY}..."
aws s3 cp "${POST_CONF_DIR}/${POST_CONF_ZIP}" "s3://${S3_BUCKET}/${POST_CONF_S3_KEY}" --region "$REGION"

echo "🔄 Updating Lambda function code for ${POST_CONF_FUNCTION_NAME}..."
aws lambda update-function-code \
  --function-name "${POST_CONF_FUNCTION_NAME}" \
  --s3-bucket "${S3_BUCKET}" \
  --s3-key "${POST_CONF_S3_KEY}" \
  --region "$REGION" \
  --no-cli-pager

echo "✅ All Lambda and Layer updates completed!"
