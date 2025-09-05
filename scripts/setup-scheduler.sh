#!/bin/bash

# setup-scheduler.sh - Cloud Scheduler設定スクリプト
# 日本時間25:00（翌日01:00）に実行するスケジュールを設定します

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-"growth-force-project"}
SERVICE_NAME="web-pixel-billing-batch"
REGION="asia-northeast1"
JOB_NAME="shopify-billing-batch"
SCHEDULE="0 1 * * *"  # Daily at 01:00 JST (25:00 previous day)
TIMEZONE="Asia/Tokyo"

echo -e "${GREEN}Cloud Scheduler設定スクリプトを開始します${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLIがインストールされていません${NC}"
    echo "Google Cloud SDKをインストールしてください: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q '@'; then
    echo -e "${YELLOW}Google Cloudでログインしてください${NC}"
    gcloud auth login
fi

# Set project
echo -e "${YELLOW}プロジェクトを設定中: $PROJECT_ID${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "${YELLOW}必要なAPIを有効化中...${NC}"
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable run.googleapis.com

# Get Cloud Run service URL
echo -e "${YELLOW}Cloud RunサービスのURLを取得中...${NC}"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)' 2>/dev/null || echo "")

if [ -z "$SERVICE_URL" ]; then
    echo -e "${RED}Error: Cloud Runサービス '$SERVICE_NAME' が見つかりません${NC}"
    echo "先にCloud Runサービスをデプロイしてください"
    exit 1
fi

echo -e "${GREEN}Cloud Runサービス URL: $SERVICE_URL${NC}"

# Create or update scheduler job
TRIGGER_URL="$SERVICE_URL/processBilling"

echo -e "${YELLOW}Cloud Schedulerジョブを設定中...${NC}"

# Check if job already exists
if gcloud scheduler jobs describe $JOB_NAME --location=$REGION --quiet 2>/dev/null; then
    echo -e "${YELLOW}既存のスケジューラージョブを更新中...${NC}"
    
    gcloud scheduler jobs update http $JOB_NAME \
        --location=$REGION \
        --schedule="$SCHEDULE" \
        --time-zone="$TIMEZONE" \
        --uri="$TRIGGER_URL" \
        --http-method=POST \
        --headers="Content-Type=application/json" \
        --message-body="{}"
    
    echo -e "${GREEN}✅ スケジューラージョブが更新されました${NC}"
else
    echo -e "${YELLOW}新しいスケジューラージョブを作成中...${NC}"
    
    gcloud scheduler jobs create http $JOB_NAME \
        --location=$REGION \
        --schedule="$SCHEDULE" \
        --time-zone="$TIMEZONE" \
        --uri="$TRIGGER_URL" \
        --http-method=POST \
        --headers="Content-Type=application/json" \
        --message-body="{}"
    
    echo -e "${GREEN}✅ スケジューラージョブが作成されました${NC}"
fi

# Show job details
echo -e "${YELLOW}作成されたスケジューラージョブの詳細:${NC}"
gcloud scheduler jobs describe $JOB_NAME --location=$REGION

echo ""
echo -e "${GREEN}🎉 Cloud Schedulerの設定が完了しました！${NC}"
echo -e "${GREEN}📅 実行スケジュール: 毎日 01:00 JST (25:00 前日)${NC}"
echo -e "${GREEN}🔗 エンドポイント: $TRIGGER_URL${NC}"

echo ""
echo -e "${YELLOW}テスト実行:${NC}"
echo "gcloud scheduler jobs run $JOB_NAME --location=$REGION"

echo ""
echo -e "${YELLOW}ジョブの実行履歴確認:${NC}"
echo "gcloud logging read \"resource.type=cloud_scheduler_job\" --limit=10"