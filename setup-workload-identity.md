# Workload Identity Federation Setup Guide

このガイドでは、GitHub ActionsからGoogle Cloudへの認証をWorkload Identity Federationに移行する手順を説明します。

## 前提条件
- Google Cloudプロジェクトへのオーナー権限
- gcloudコマンドラインツール

## セットアップ手順

### 1. 必要な情報を設定
```bash
export PROJECT_ID="growth-force-project"
export SERVICE_ACCOUNT_NAME="github-actions-deploy"
export POOL_NAME="github-pool"
export PROVIDER_NAME="github-provider"
export GITHUB_REPO="あなたのGitHubユーザー名/web-pixel-billing-batch"
```

### 2. サービスアカウントを作成
```bash
gcloud iam service-accounts create ${SERVICE_ACCOUNT_NAME} \
  --display-name="GitHub Actions Deploy Service Account" \
  --project=${PROJECT_ID}
```

### 3. 必要な権限を付与
```bash
# Cloud Functions開発者権限
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.developer"

# Cloud Scheduler管理者権限
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudscheduler.admin"

# サービスアカウントユーザー権限
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### 4. Workload Identity Poolを作成
```bash
gcloud iam workload-identity-pools create ${POOL_NAME} \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project=${PROJECT_ID}
```

### 5. Workload Identity Providerを作成
```bash
gcloud iam workload-identity-pools providers create-oidc ${PROVIDER_NAME} \
  --location="global" \
  --workload-identity-pool=${POOL_NAME} \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository == '${GITHUB_REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project=${PROJECT_ID}
```

### 6. サービスアカウントへのなりすまし権限を付与
```bash
gcloud iam service-accounts add-iam-policy-binding \
  ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud config get-value project --quiet | xargs -I {} gcloud projects describe {} --format='value(projectNumber)')/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}" \
  --role="roles/iam.workloadIdentityUser" \
  --project=${PROJECT_ID}
```

### 7. GitHub Secretsに設定する値を取得

#### WIF_PROVIDER
```bash
echo "projects/$(gcloud config get-value project --quiet | xargs -I {} gcloud projects describe {} --format='value(projectNumber)')/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"
```

#### WIF_SERVICE_ACCOUNT
```bash
echo "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
```

### 8. GitHub Secretsを設定

GitHubリポジトリの Settings → Secrets and variables → Actions で以下のシークレットを追加：

- `WIF_PROVIDER`: 手順7で取得した値
- `WIF_SERVICE_ACCOUNT`: 手順7で取得した値

## 既存のシークレットの削除

以下のシークレットは不要になるので削除できます：
- `GCP_PROJECT_ID`
- `GCP_PRIVATE_KEY_ID`
- `GCP_PRIVATE_KEY`
- `GCP_CLIENT_EMAIL`
- `GCP_CLIENT_ID`
- `GCP_CLIENT_X509_CERT_URL`

## トラブルシューティング

### 認証エラーが発生する場合
1. リポジトリ名が正しく設定されているか確認
2. サービスアカウントの権限が適切に付与されているか確認
3. GitHub Secretsの値が正しく設定されているか確認

### デバッグ方法
```bash
# Workload Identity Poolの確認
gcloud iam workload-identity-pools describe ${POOL_NAME} \
  --location="global" \
  --project=${PROJECT_ID}

# Providerの確認
gcloud iam workload-identity-pools providers describe ${PROVIDER_NAME} \
  --location="global" \
  --workload-identity-pool=${POOL_NAME} \
  --project=${PROJECT_ID}
```