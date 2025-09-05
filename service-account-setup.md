# Google Cloud Service Account セットアップ手順

## 1. サービスアカウントの作成・設定

Google Cloud Consoleで以下の手順を実行してください：

### Step 1: サービスアカウントの確認・作成
```bash
# 現在のサービスアカウントを確認
gcloud iam service-accounts list --project=growth-force-project

# 存在しない場合は作成
gcloud iam service-accounts create shopify-billing-sa \
    --project=growth-force-project \
    --display-name="Shopify Billing Service Account"
```

### Step 2: 必要な権限を付与
```bash
# Cloud Functions Developer権限
gcloud projects add-iam-policy-binding growth-force-project \
    --member="serviceAccount:shopify-billing-sa@growth-force-project.iam.gserviceaccount.com" \
    --role="roles/cloudfunctions.developer"

# Cloud Build Service Account権限
gcloud projects add-iam-policy-binding growth-force-project \
    --member="serviceAccount:shopify-billing-sa@growth-force-project.iam.gserviceaccount.com" \
    --role="roles/cloudbuild.builds.editor"

# Cloud Scheduler Admin権限
gcloud projects add-iam-policy-binding growth-force-project \
    --member="serviceAccount:shopify-billing-sa@growth-force-project.iam.gserviceaccount.com" \
    --role="roles/cloudscheduler.admin"

# BigQuery権限
gcloud projects add-iam-policy-binding growth-force-project \
    --member="serviceAccount:shopify-billing-sa@growth-force-project.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataEditor"

# Storage権限（必要に応じて）
gcloud projects add-iam-policy-binding growth-force-project \
    --member="serviceAccount:shopify-billing-sa@growth-force-project.iam.gserviceaccount.com" \
    --role="roles/storage.admin"
```

### Step 3: 新しいキーを生成
```bash
gcloud iam service-accounts keys create service-account-key.json \
    --iam-account=shopify-billing-sa@growth-force-project.iam.gserviceaccount.com \
    --project=growth-force-project
```

### Step 4: キーの内容をGitHub Secretsに設定
1. `service-account-key.json`の内容をコピー
2. GitHub Repository Settings > Secrets and variables > Actions
3. `GOOGLE_CLOUD_SA_KEY`に貼り付け

## 2. 代替手順（Cloud Console UI使用）

1. [Google Cloud Console](https://console.cloud.google.com/) > IAM & Admin > Service Accounts
2. `shopify-billing-sa@growth-force-project.iam.gserviceaccount.com`を選択
3. "Keys" タブ > "Add Key" > "Create new key" > JSON形式
4. ダウンロードしたJSONファイルの内容をGitHub Secretsに設定

## 3. 必要な権限一覧

- `roles/cloudfunctions.developer` - Cloud Functions の作成・更新・削除
- `roles/cloudbuild.builds.editor` - Cloud Build でのビルド実行
- `roles/cloudscheduler.admin` - Cloud Scheduler ジョブの管理
- `roles/bigquery.dataEditor` - BigQuery テーブルへの読み書き
- `roles/storage.admin` - Cloud Storage（必要に応じて）