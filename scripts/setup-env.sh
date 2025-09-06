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

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROD_ENV_FILE="$PROJECT_ROOT/prod.env"

# Check if prod.env exists
if [ ! -f "$PROD_ENV_FILE" ]; then
    echo -e "${RED}Error: prod.envファイルが見つかりません${NC}"
    echo "プロジェクトルートにprod.envファイルを作成してください: $PROD_ENV_FILE"
    echo "例:"
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

echo -e "${YELLOW}既存のGitHub Secretsを削除しています...${NC}"

# Delete all existing secrets
EXISTING_SECRETS=$(gh secret list --json name -q '.[].name')
if [ -n "$EXISTING_SECRETS" ]; then
    while IFS= read -r secret; do
        echo -e "${YELLOW}Deleting: $secret${NC}"
        gh secret delete "$secret" 2>/dev/null || echo -e "${RED}  Failed to delete $secret${NC}"
    done <<< "$EXISTING_SECRETS"
    echo -e "${GREEN}✅ 既存のSecretsをすべて削除しました${NC}"
else
    echo -e "${YELLOW}削除するSecretsはありません${NC}"
fi

echo -e "${YELLOW}prod.envファイルを読み込んでいます...${NC}"

# Read prod.env and set GitHub secrets

while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
        continue
    fi
    
    # Check if line contains =
    if [[ ! "$line" == *"="* ]]; then
        continue
    fi
    
    # Split on first = using cut
    key=$(echo "$line" | cut -d'=' -f1)
    value=$(echo "$line" | cut -d'=' -f2-)
    
    # Remove leading/trailing whitespace from key
    key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    # Remove quotes from value if present (both single and double quotes)
    value=$(echo "$value" | sed "s/^[\"']//;s/[\"']$//")
    
    if [ -n "$key" ] && [ -n "$value" ]; then
        echo -e "${YELLOW}Setting GitHub secret: $key${NC}"
        echo -e "${YELLOW}  Value length: ${#value} chars${NC}"
        echo -e "${YELLOW}  Value preview: ${value:0:20}...${NC}"
        
        # Use the same method as the working script
        echo "$value" | gh secret set "$key"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Successfully set $key${NC}"
        else
            echo -e "${RED}❌ Failed to set $key${NC}"
        fi
    fi
done < "$PROD_ENV_FILE"

# Temp file no longer needed since we're not using it

echo -e "${GREEN}GitHub環境変数の設定が完了しました！${NC}"

# Verify secrets were set
echo -e "${YELLOW}設定された秘密情報を確認中...${NC}"
gh secret list

echo -e "${GREEN}✅ 設定完了！これでGitHubワークフローがprod.envの値を使用できます。${NC}"