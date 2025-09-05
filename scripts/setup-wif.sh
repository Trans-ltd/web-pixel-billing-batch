#!/bin/bash

# Workload Identity Federation Setup Script
# This script sets up WIF for GitHub Actions to authenticate with Google Cloud

set -e

# Configuration
PROJECT_ID="growth-force-project"
SERVICE_ACCOUNT_NAME="github-actions-deploy"
POOL_NAME="github-pool"
PROVIDER_NAME="github-provider"
GITHUB_REPO="${GITHUB_REPO:-hasumiyuuta/web-pixel-billing-batch}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Workload Identity Federation setup...${NC}"
echo "Project ID: ${PROJECT_ID}"
echo "GitHub Repo: ${GITHUB_REPO}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    exit 1
fi

# Set the project
echo -e "${YELLOW}Setting project...${NC}"
gcloud config set project ${PROJECT_ID}

# Get project number
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
echo "Project Number: ${PROJECT_NUMBER}"

# Create service account
echo -e "${YELLOW}Creating service account...${NC}"
if gcloud iam service-accounts describe ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com --project=${PROJECT_ID} &>/dev/null; then
    echo "Service account already exists"
else
    gcloud iam service-accounts create ${SERVICE_ACCOUNT_NAME} \
        --display-name="GitHub Actions Deploy Service Account" \
        --project=${PROJECT_ID}
    echo "Service account created"
fi

# Grant necessary permissions
echo -e "${YELLOW}Granting permissions to service account...${NC}"

# Cloud Functions Developer
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudfunctions.developer" \
    --condition=None

# Cloud Scheduler Admin
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudscheduler.admin" \
    --condition=None

# Service Account User
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --condition=None

echo "Permissions granted"

# Enable required APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable iamcredentials.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com
gcloud services enable sts.googleapis.com

# Create Workload Identity Pool
echo -e "${YELLOW}Creating Workload Identity Pool...${NC}"
if gcloud iam workload-identity-pools describe ${POOL_NAME} --location=global --project=${PROJECT_ID} &>/dev/null; then
    echo "Workload Identity Pool already exists"
else
    gcloud iam workload-identity-pools create ${POOL_NAME} \
        --location="global" \
        --display-name="GitHub Actions Pool" \
        --project=${PROJECT_ID}
    echo "Workload Identity Pool created"
fi

# Create Workload Identity Provider
echo -e "${YELLOW}Creating Workload Identity Provider...${NC}"
if gcloud iam workload-identity-pools providers describe ${PROVIDER_NAME} --workload-identity-pool=${POOL_NAME} --location=global --project=${PROJECT_ID} &>/dev/null; then
    echo "Workload Identity Provider already exists"
else
    gcloud iam workload-identity-pools providers create-oidc ${PROVIDER_NAME} \
        --location="global" \
        --workload-identity-pool=${POOL_NAME} \
        --display-name="GitHub Provider" \
        --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
        --attribute-condition="assertion.repository == '${GITHUB_REPO}'" \
        --issuer-uri="https://token.actions.githubusercontent.com" \
        --project=${PROJECT_ID}
    echo "Workload Identity Provider created"
fi

# Grant service account impersonation permission
echo -e "${YELLOW}Configuring service account impersonation...${NC}"
gcloud iam service-accounts add-iam-policy-binding \
    ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com \
    --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}" \
    --role="roles/iam.workloadIdentityUser" \
    --project=${PROJECT_ID}

echo "Service account impersonation configured"

# Generate values for GitHub Secrets
WIF_PROVIDER="//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"
WIF_SERVICE_ACCOUNT="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Save to prod.env
echo -e "${YELLOW}Saving configuration to prod.env...${NC}"
cat > ../prod.env << EOF
# Workload Identity Federation Configuration
# Generated on $(date)
WIF_PROVIDER=${WIF_PROVIDER}
WIF_SERVICE_ACCOUNT=${WIF_SERVICE_ACCOUNT}
EOF

echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Configuration saved to prod.env:"
echo "  WIF_PROVIDER: ${WIF_PROVIDER}"
echo "  WIF_SERVICE_ACCOUNT: ${WIF_SERVICE_ACCOUNT}"
echo ""
echo "Next step: Run './setup-env.sh' to configure GitHub Secrets"