#!/bin/bash

# IAM権限設定スクリプト
# Cloud Functions (Gen2) デプロイに必要な権限を設定します

set -e

PROJECT_ID="growth-force-project"
SERVICE_ACCOUNT="github-actions-deploy@growth-force-project.iam.gserviceaccount.com"

echo "Setting up IAM permissions for Cloud Functions deployment..."
echo "Project: $PROJECT_ID"
echo "Service Account: $SERVICE_ACCOUNT"
echo ""

# 必要なロールを配列で定義
ROLES=(
    "roles/cloudfunctions.admin"
    "roles/run.admin"
    "roles/iam.serviceAccountUser"
    "roles/storage.objectAdmin"
    "roles/artifactregistry.writer"
)

# Cloud Buildサービスアカウントにも権限を付与
CLOUD_BUILD_SA="32670171847-compute@developer.gserviceaccount.com"
echo "Setting up permissions for Cloud Build service account..."
echo "Cloud Build SA: $CLOUD_BUILD_SA"
echo ""

echo "Granting roles/cloudbuild.builds.builder to Cloud Build SA..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUD_BUILD_SA" \
    --role="roles/cloudbuild.builds.builder" \
    --quiet

if [ $? -eq 0 ]; then
    echo "✅ Successfully granted roles/cloudbuild.builds.builder to Cloud Build SA"
else
    echo "❌ Failed to grant role to Cloud Build SA"
fi
echo ""

# GitHub Actionsサービスアカウントに各ロールを付与
for ROLE in "${ROLES[@]}"
do
    echo "Granting $ROLE to GitHub Actions SA..."
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="$ROLE" \
        --quiet
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully granted $ROLE to GitHub Actions SA"
    else
        echo "❌ Failed to grant $ROLE"
        exit 1
    fi
    echo ""
done

echo "✅ All IAM permissions have been successfully configured!"
echo ""
echo "The following roles have been granted to $SERVICE_ACCOUNT:"
for ROLE in "${ROLES[@]}"
do
    echo "  - $ROLE"
done