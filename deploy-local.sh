#!/bin/bash

# Cloud Functions Deploy Script for Local Testing
# This script mirrors the GitHub Actions deployment

set -e

# Configuration (same as GitHub Actions)
PROJECT_ID="growth-force-project"
FUNCTION_NAME="web-pixel-billing-batch"
REGION="asia-northeast1"

echo "=== Cloud Functions Deployment Script ==="
echo "Project: ${PROJECT_ID}"
echo "Function: ${FUNCTION_NAME}"
echo "Region: ${REGION}"
echo ""

# Check if gcloud is authenticated
echo "Checking authentication..."
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
if [ -z "$ACTIVE_ACCOUNT" ]; then
    echo "Error: No active gcloud account. Please run 'gcloud auth login'"
    exit 1
fi
echo "Active account: ${ACTIVE_ACCOUNT}"

# Check current project
CURRENT_PROJECT=$(gcloud config get-value project)
if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
    echo "Warning: Current project is '${CURRENT_PROJECT}', expected '${PROJECT_ID}'"
    read -p "Do you want to switch to ${PROJECT_ID}? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        gcloud config set project ${PROJECT_ID}
    else
        echo "Aborting deployment"
        exit 1
    fi
fi

# Build TypeScript
echo ""
echo "Building TypeScript..."
npm run compile

# Deploy to Cloud Functions
echo ""
echo "Deploying to Cloud Functions..."
gcloud functions deploy ${FUNCTION_NAME} \
  --gen2 \
  --runtime=nodejs20 \
  --region=${REGION} \
  --source=dist \
  --entry-point=processBilling \
  --trigger-http \
  --allow-unauthenticated \
  --memory=256M \
  --timeout=540s \
  --max-instances=1 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},NODE_ENV=production"

echo ""
echo "Deployment complete!"

# Get function URL
echo ""
echo "Getting function URL..."
FUNCTION_URL=$(gcloud functions describe ${FUNCTION_NAME} --region=${REGION} --format='value(serviceConfig.uri)')
echo "Function URL: ${FUNCTION_URL}"

# Optional: Update Cloud Scheduler
echo ""
read -p "Do you want to update Cloud Scheduler job? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Check if scheduler job exists
    if gcloud scheduler jobs describe shopify-billing-batch --location=${REGION} --quiet 2>/dev/null; then
        echo "Updating existing scheduler job..."
        gcloud scheduler jobs update http shopify-billing-batch \
            --location=${REGION} \
            --schedule="0 1 * * *" \
            --time-zone="Asia/Tokyo" \
            --uri="${FUNCTION_URL}" \
            --http-method=POST \
            --update-headers="Content-Type=application/json" \
            --message-body="{}"
    else
        echo "Creating new scheduler job..."
        gcloud scheduler jobs create http shopify-billing-batch \
            --location=${REGION} \
            --schedule="0 1 * * *" \
            --time-zone="Asia/Tokyo" \
            --uri="${FUNCTION_URL}" \
            --http-method=POST \
            --headers="Content-Type=application/json" \
            --message-body="{}"
    fi
    echo "Scheduler job configured!"
fi

echo ""
echo "All done!"