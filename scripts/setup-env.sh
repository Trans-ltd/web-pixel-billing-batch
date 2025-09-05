#!/bin/bash

# setup-env.sh - GitHub環境変数自動設定スクリプト
# prod.envファイルからGitHub Secretsを自動設定します

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}GitHub環境変数設定スクリプトを開始します${NC}"

# Check if prod.env exists
if [ ! -f "prod.env" ]; then
    echo -e "${RED}Error: prod.envファイルが見つかりません${NC}"
    echo "prod.envファイルを作成してください。例:"
    echo "GOOGLE_CLOUD_PROJECT=growth-force-project"
    echo "GOOGLE_CLOUD_SA_KEY={\"type\":\"service_account\",...}"
    exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) がインストールされていません${NC}"
    echo "以下のコマンドでインストールしてください:"
    echo "brew install gh"
    echo "または https://cli.github.com/ を参照"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}GitHub CLIでログインしてください${NC}"
    gh auth login
fi

echo -e "${YELLOW}prod.envファイルを読み込んでいます...${NC}"

# Read prod.env and set GitHub secrets
while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip empty lines and comments
    if [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]]; then
        continue
    fi
    
    # Remove leading/trailing whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)
    
    # Remove quotes from value if present
    value=$(echo "$value" | sed 's/^"//;s/"$//')
    
    if [ -n "$key" ] && [ -n "$value" ]; then
        echo -e "${YELLOW}Setting GitHub secret: $key${NC}"
        
        # Use gh CLI to set the secret
        echo "$value" | gh secret set "$key" --body -
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Successfully set $key${NC}"
        else
            echo -e "${RED}❌ Failed to set $key${NC}"
        fi
    fi
done < prod.env

echo -e "${GREEN}GitHub環境変数の設定が完了しました！${NC}"

# Verify secrets were set
echo -e "${YELLOW}設定された秘密情報を確認中...${NC}"
gh secret list

echo -e "${GREEN}✅ 設定完了！これでGitHubワークフローがprod.envの値を使用できます。${NC}"