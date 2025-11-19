#!/bin/bash
set -e

# Check for help flag
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    echo "Smart Lambda Deployment Script"
    echo ""
    echo "This script intelligently deploys Lambda functions based on git changes."
    echo ""
    echo "Usage: ./deploy.sh [options]"
    echo ""
    echo "Options:"
    echo "  --help, -h     Show this help message"
    echo "  --force, -f    Force deploy all functions regardless of changes"
    echo "  --dry-run, -d  Show what would be deployed without actually deploying"
    echo ""
    echo "Features:"
    echo "  • Automatically detects changes since last git commit"
    echo "  • Only deploys changed Lambda functions and layers"
    echo "  • Handles layer dependencies (when common_models changes, dependent functions are also deployed)"
    echo "  • Interactive mode when no changes are detected"
    echo "  • Colored output for better readability"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh                    # Smart deployment based on git changes"
    echo "  ./deploy.sh --force            # Deploy all functions"
    echo "  ./deploy.sh --dry-run          # See what would be deployed"
    echo ""
    exit 0
fi

# Configuration (easily extensible for future environments)
ENVIRONMENT=${ENVIRONMENT:-dev}
S3_BUCKET="emenu-lambda-code-bucket"
REGION="ap-southeast-2"

# Future: support for production environment
# if [[ "$ENVIRONMENT" == "prod" ]]; then
#     S3_BUCKET="emenu-lambda-code-bucket-prod"
#     REGION="us-east-1"  # or your preferred prod region
# fi

# Parse command line arguments
FORCE_DEPLOY=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE_DEPLOY=true
            shift
            ;;
        --dry-run|-d)
            DRY_RUN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_step() {
    echo -e "${BLUE}📦 $1${NC}"
}

# Function to check if files have changed since last commit
has_changes() {
    local path=$1
    local changes=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | grep "^$path" || true)
    [[ -n "$changes" ]]
}

# Function to check if we're in a git repository
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_warning "Not in a git repository. Will deploy all functions."
        return 1
    fi
    return 0
}

# Determine what needs to be deployed based on git changes
IS_GIT_REPO=false
DEPLOY_COMMON_MODELS=false
DEPLOY_EMENU_SERVER=false
DEPLOY_POST_CONFIRMATION=false
DEPLOY_PRESIGNED_URL=false
DEPLOY_IMAGE_PROCESSOR=false

if $FORCE_DEPLOY; then
    print_info "Force deploy mode: deploying all functions"
    DEPLOY_COMMON_MODELS=true
    DEPLOY_EMENU_SERVER=true
    DEPLOY_POST_CONFIRMATION=true
    DEPLOY_PRESIGNED_URL=true
    DEPLOY_IMAGE_PROCESSOR=true
elif check_git_repo; then
    IS_GIT_REPO=true
    print_info "Detecting changes since last commit..."
    
    # Check for layer changes
    if has_changes "lambdas/layers/common_models/"; then
        print_info "Changes detected in common_models layer"
        DEPLOY_COMMON_MODELS=true
        # Layer changes affect dependent functions
        DEPLOY_EMENU_SERVER=true
        DEPLOY_POST_CONFIRMATION=true
    fi
    
    # Check for individual function changes
    if has_changes "lambdas/emenu_server/"; then
        print_info "Changes detected in emenu_server"
        DEPLOY_EMENU_SERVER=true
    fi
    
    if has_changes "lambdas/emenu_post_confirmation/"; then
        print_info "Changes detected in emenu_post_confirmation"
        DEPLOY_POST_CONFIRMATION=true
    fi
    
    if has_changes "lambdas/presigned_url_generator/"; then
        print_info "Changes detected in presigned_url_generator"
        DEPLOY_PRESIGNED_URL=true
    fi
    
    if has_changes "lambdas/image_processor/"; then
        print_info "Changes detected in image_processor"
        DEPLOY_IMAGE_PROCESSOR=true
    fi
    
    # If shared image_uploader changes, deploy both presigned_url_generator and image_processor
    if has_changes "lambdas/image_uploader/"; then
        print_info "Changes detected in shared image_uploader module"
        DEPLOY_PRESIGNED_URL=true
        DEPLOY_IMAGE_PROCESSOR=true
    fi
    
    # If no changes detected, ask user what to do (unless in dry-run mode)
    if ! $DEPLOY_COMMON_MODELS && ! $DEPLOY_EMENU_SERVER && ! $DEPLOY_POST_CONFIRMATION && ! $DEPLOY_PRESIGNED_URL && ! $DEPLOY_IMAGE_PROCESSOR; then
        if $DRY_RUN; then
            print_warning "No Lambda-related changes detected since last commit."
        else
            print_warning "No Lambda-related changes detected since last commit."
            echo -e "Options:"
            echo -e "  ${BLUE}1${NC}: Deploy all functions anyway"
            echo -e "  ${BLUE}2${NC}: Exit without deploying"
            echo -e "  ${BLUE}3${NC}: Select specific functions to deploy"
            read -p "Choose option (1-3): " choice
            
            case $choice in
                1)
                    print_info "Deploying all functions..."
                    DEPLOY_COMMON_MODELS=true
                    DEPLOY_EMENU_SERVER=true
                    DEPLOY_POST_CONFIRMATION=true
                    DEPLOY_PRESIGNED_URL=true
                    DEPLOY_IMAGE_PROCESSOR=true
                    ;;
                2)
                    print_info "Exiting without deployment."
                    exit 0
                    ;;
                3)
                    echo "Select functions to deploy (y/n):"
                    read -p "Common models layer? (y/n): " layer_choice
                    [[ "$layer_choice" =~ ^[Yy]$ ]] && DEPLOY_COMMON_MODELS=true && DEPLOY_EMENU_SERVER=true && DEPLOY_POST_CONFIRMATION=true
                    
                    read -p "emenu_server? (y/n): " server_choice
                    [[ "$server_choice" =~ ^[Yy]$ ]] && DEPLOY_EMENU_SERVER=true
                    
                    read -p "emenu_post_confirmation? (y/n): " post_choice
                    [[ "$post_choice" =~ ^[Yy]$ ]] && DEPLOY_POST_CONFIRMATION=true
                    
                    read -p "presigned_url_generator? (y/n): " presigned_choice
                    [[ "$presigned_choice" =~ ^[Yy]$ ]] && DEPLOY_PRESIGNED_URL=true
                    
                    read -p "image_processor? (y/n): " image_choice
                    [[ "$image_choice" =~ ^[Yy]$ ]] && DEPLOY_IMAGE_PROCESSOR=true
                    ;;
                *)
                    print_error "Invalid choice. Exiting."
                    exit 1
                    ;;
            esac
        fi
    fi
else
    print_warning "Not in git repository or no commit history. Deploying all functions."
    DEPLOY_COMMON_MODELS=true
    DEPLOY_EMENU_SERVER=true
    DEPLOY_POST_CONFIRMATION=true
    DEPLOY_PRESIGNED_URL=true
    DEPLOY_IMAGE_PROCESSOR=true
fi

echo ""
print_info "=== Deployment Plan ==="
echo -e "Common Models Layer: $([ $DEPLOY_COMMON_MODELS = true ] && echo -e "${GREEN}DEPLOY${NC}" || echo -e "${YELLOW}SKIP${NC}")"
echo -e "emenu_server: $([ $DEPLOY_EMENU_SERVER = true ] && echo -e "${GREEN}DEPLOY${NC}" || echo -e "${YELLOW}SKIP${NC}")"
echo -e "emenu_post_confirmation: $([ $DEPLOY_POST_CONFIRMATION = true ] && echo -e "${GREEN}DEPLOY${NC}" || echo -e "${YELLOW}SKIP${NC}")"
echo -e "presigned_url_generator: $([ $DEPLOY_PRESIGNED_URL = true ] && echo -e "${GREEN}DEPLOY${NC}" || echo -e "${YELLOW}SKIP${NC}")"
echo -e "image_processor: $([ $DEPLOY_IMAGE_PROCESSOR = true ] && echo -e "${GREEN}DEPLOY${NC}" || echo -e "${YELLOW}SKIP${NC}")"
echo ""

if $DRY_RUN; then
    print_info "DRY RUN MODE: Showing what would be deployed"
    DEPLOYED_COUNT=0
    $DEPLOY_COMMON_MODELS && ((DEPLOYED_COUNT++))
    $DEPLOY_EMENU_SERVER && ((DEPLOYED_COUNT++))
    $DEPLOY_POST_CONFIRMATION && ((DEPLOYED_COUNT++))
    $DEPLOY_PRESIGNED_URL && ((DEPLOYED_COUNT++))
    $DEPLOY_IMAGE_PROCESSOR && ((DEPLOYED_COUNT++))
    
    print_success "Would deploy $DEPLOYED_COUNT out of 5 components"
    exit 0
fi

read -p "Proceed with deployment? (y/n): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    print_info "Deployment cancelled."
    exit 0
fi

echo ""
print_info "=== Starting Intelligent Lambda Deployment ==="

# --- Layer: common_models ---
if $DEPLOY_COMMON_MODELS; then
    print_step "Deploying common_models layer..."
    LAYER_DIR="lambdas/layers/common_models"
    LAYER_ZIP="common_models_layer.zip"
    LAYER_S3_KEY="layers/common_models/${LAYER_ZIP}"

    echo "📦 Installing Layer dependencies..."
    (cd "$LAYER_DIR/nodejs" && npm install)

    echo "📦 Packaging Layer zip from ${LAYER_DIR}..."
    (cd "$LAYER_DIR" && zip -r "$LAYER_ZIP" nodejs)

    echo "🚀 Uploading Layer to S3: s3://${S3_BUCKET}/${LAYER_S3_KEY}..."
    aws s3 cp "${LAYER_DIR}/${LAYER_ZIP}" "s3://${S3_BUCKET}/${LAYER_S3_KEY}" --region "$REGION"
    
    print_success "common_models layer deployed successfully"
else
    print_warning "Skipping common_models layer (no changes detected)"
fi

# --- Function: emenu_server ---
if $DEPLOY_EMENU_SERVER; then
    print_step "Deploying emenu_server function..."
    SERVER_DIR="lambdas/emenu_server"
    SERVER_ZIP="appsync_main_handler.zip"
    SERVER_S3_KEY="lambdas/emenu_server/${SERVER_ZIP}"
    SERVER_FUNCTION_NAME="emenu-server"

    echo "📦 Installing emenu_server dependencies in ${SERVER_DIR}..."
    (cd "$SERVER_DIR" && npm install)

    echo "📦 Packaging emenu_server zip from ${SERVER_DIR}..."
    (cd "$SERVER_DIR" && zip -r "$SERVER_ZIP" .)

    echo "🚀 Uploading emenu_server to S3: s3://${S3_BUCKET}/${SERVER_S3_KEY}..."
    aws s3 cp "${SERVER_DIR}/${SERVER_ZIP}" "s3://${S3_BUCKET}/${SERVER_S3_KEY}" --region "$REGION"

    echo "🔄 Updating Lambda function code for ${SERVER_FUNCTION_NAME}..."
    aws lambda update-function-code \
        --function-name "${SERVER_FUNCTION_NAME}" \
        --s3-bucket "${S3_BUCKET}" \
        --s3-key "${SERVER_S3_KEY}" \
        --region "$REGION" \
        --no-cli-pager
    
    print_success "emenu_server deployed successfully"
else
    print_warning "Skipping emenu_server (no changes detected)"
fi

# --- Function: emenu_post_confirmation ---
if $DEPLOY_POST_CONFIRMATION; then
    print_step "Deploying emenu_post_confirmation function..."
    POST_CONF_DIR="lambdas/emenu_post_confirmation"
    POST_CONF_ZIP="cognito_trigger.zip"
    POST_CONF_S3_KEY="lambdas/emenu_post_confirmation/${POST_CONF_ZIP}"
    POST_CONF_FUNCTION_NAME="emenu_post_confirmation"

    echo "📦 Installing emenu_post_confirmation dependencies in ${POST_CONF_DIR}..."
    (cd "$POST_CONF_DIR" && npm install)

    echo "📦 Packaging emenu_post_confirmation zip from ${POST_CONF_DIR}..."
    (cd "$POST_CONF_DIR" && zip -r "$POST_CONF_ZIP" .)

    echo "🚀 Uploading emenu_post_confirmation code to S3: s3://${S3_BUCKET}/${POST_CONF_S3_KEY}..."
    aws s3 cp "${POST_CONF_DIR}/${POST_CONF_ZIP}" "s3://${S3_BUCKET}/${POST_CONF_S3_KEY}" --region "$REGION"

    echo "🔄 Updating Lambda function code for ${POST_CONF_FUNCTION_NAME}..."
    aws lambda update-function-code \
      --function-name "${POST_CONF_FUNCTION_NAME}" \
      --s3-bucket "${S3_BUCKET}" \
      --s3-key "${POST_CONF_S3_KEY}" \
      --region "$REGION" \
      --no-cli-pager
    
    print_success "emenu_post_confirmation deployed successfully"
else
    print_warning "Skipping emenu_post_confirmation (no changes detected)"
fi

# --- Function: presigned_url_generator ---
if $DEPLOY_PRESIGNED_URL; then
    print_step "Deploying presigned_url_generator function..."
    PRESIGNED_DIR="lambdas/presigned_url_generator"
    PRESIGNED_ZIP="presigned_url_generator.zip"
    PRESIGNED_S3_KEY="lambdas/presigned_url_generator/${PRESIGNED_ZIP}"
    PRESIGNED_FUNCTION_NAME="emenu-presigned-url-generator-${ENVIRONMENT}"

    echo "📦 Installing presigned_url_generator dependencies in ${PRESIGNED_DIR}..."
    (cd "$PRESIGNED_DIR" && npm install)

    echo "📦 Copying shared image_uploader module..."
    mkdir -p "${PRESIGNED_DIR}/image_uploader"
    cp "lambdas/image_uploader/index.js" "${PRESIGNED_DIR}/image_uploader/"

    echo "📦 Packaging presigned_url_generator zip from ${PRESIGNED_DIR}..."
    (cd "$PRESIGNED_DIR" && zip -r "$PRESIGNED_ZIP" . -x "*.zip")

    echo "🧹 Cleaning up copied files..."
    rm -rf "${PRESIGNED_DIR}/image_uploader"

    echo "🚀 Uploading presigned_url_generator to S3: s3://${S3_BUCKET}/${PRESIGNED_S3_KEY}..."
    aws s3 cp "${PRESIGNED_DIR}/${PRESIGNED_ZIP}" "s3://${S3_BUCKET}/${PRESIGNED_S3_KEY}" --region "$REGION"

    echo "🔄 Updating Lambda function code for ${PRESIGNED_FUNCTION_NAME}..."
    aws lambda update-function-code \
        --function-name "${PRESIGNED_FUNCTION_NAME}" \
        --s3-bucket "${S3_BUCKET}" \
        --s3-key "${PRESIGNED_S3_KEY}" \
        --region "$REGION" \
        --no-cli-pager
    
    print_success "presigned_url_generator deployed successfully"
else
    print_warning "Skipping presigned_url_generator (no changes detected)"
fi

# --- Function: image_processor ---
if $DEPLOY_IMAGE_PROCESSOR; then
    print_step "Deploying image_processor function..."
    IMAGE_PROC_DIR="lambdas/image_processor"
    IMAGE_PROC_ZIP="image_processor.zip"
    IMAGE_PROC_S3_KEY="lambdas/image_processor/${IMAGE_PROC_ZIP}"
    IMAGE_PROC_FUNCTION_NAME="emenu-image-processor-${ENVIRONMENT}"

    echo "📦 Installing image_processor dependencies in ${IMAGE_PROC_DIR}..."
    (cd "$IMAGE_PROC_DIR" && npm install)

    echo "📦 Copying shared image_uploader module..."
    mkdir -p "${IMAGE_PROC_DIR}/image_uploader"
    cp "lambdas/image_uploader/index.js" "${IMAGE_PROC_DIR}/image_uploader/"

    echo "📦 Packaging image_processor zip from ${IMAGE_PROC_DIR}..."
    (cd "$IMAGE_PROC_DIR" && zip -r "$IMAGE_PROC_ZIP" . -x "*.zip")

    echo "🧹 Cleaning up copied files..."
    rm -rf "${IMAGE_PROC_DIR}/image_uploader"

    echo "🚀 Uploading image_processor to S3: s3://${S3_BUCKET}/${IMAGE_PROC_S3_KEY}..."
    aws s3 cp "${IMAGE_PROC_DIR}/${IMAGE_PROC_ZIP}" "s3://${S3_BUCKET}/${IMAGE_PROC_S3_KEY}" --region "$REGION"

    echo "🔄 Updating Lambda function code for ${IMAGE_PROC_FUNCTION_NAME}..."
    aws lambda update-function-code \
        --function-name "${IMAGE_PROC_FUNCTION_NAME}" \
        --s3-bucket "${S3_BUCKET}" \
        --s3-key "${IMAGE_PROC_S3_KEY}" \
        --region "$REGION" \
        --no-cli-pager
    
    print_success "image_processor deployed successfully"
else
    print_warning "Skipping image_processor (no changes detected)"
fi

echo ""
print_success "=== Intelligent Deployment Complete ==="

# Summary
DEPLOYED_COUNT=0
$DEPLOY_COMMON_MODELS && ((DEPLOYED_COUNT++))
$DEPLOY_EMENU_SERVER && ((DEPLOYED_COUNT++))
$DEPLOY_POST_CONFIRMATION && ((DEPLOYED_COUNT++))
$DEPLOY_PRESIGNED_URL && ((DEPLOYED_COUNT++))
$DEPLOY_IMAGE_PROCESSOR && ((DEPLOYED_COUNT++))

print_info "Deployed $DEPLOYED_COUNT out of 5 components"

if $DEPLOY_COMMON_MODELS || $DEPLOY_EMENU_SERVER || $DEPLOY_POST_CONFIRMATION; then
    print_warning "Note: Functions using common_models layer may need Terraform apply to update layer version references"
fi

print_info "💡 Run 'terraform plan' and 'terraform apply' in the infra/main directory if infrastructure changes are needed."
