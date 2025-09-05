# Web Pixel Billing Batch

Shopifyの従量課金システム - Cloud Run、Pub/Sub、BigQueryを使用した自動課金処理バッチ

## 概要

このシステムは、Shopifyクライアントのページビュー数に基づいて従量課金を自動で処理するバッチシステムです。毎日日本時間25:00（翌日01:00）に実行され、前日のページビューデータを集計して課金レコードを生成します。

## 機能要件

- **スケジュール**: 日本時間25:00（翌日01:00）に毎日実行
- **データソース**: 
  - `growth-force-project.session_manager.shopify_sessions` - Shopifyセッション情報
  - `growth-force-project.ad_analytics.events` - ページビューイベント
- **課金レート**: 100万ページビューあたり$10
- **出力**: `growth-force-project.billing.usage_records` - 課金レコード

## アーキテクチャ

- **Cloud Run Function**: TypeScriptで実装されたメイン処理
- **Cloud Scheduler**: 日次実行トリガー
- **BigQuery**: データの読み取りと課金レコードの保存
- **Docker**: コンテナ化とデプロイ

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

```bash
# テンプレートをコピー
cp prod.env.template prod.env

# prod.envを編集して実際の値を設定
# - GOOGLE_CLOUD_SA_KEY: サービスアカウントキーのJSON
# - GOOGLE_CLOUD_PROJECT: プロジェクトID
```

### 3. GitHub環境変数の設定

```bash
# prod.envからGitHub Secretsを自動設定
./scripts/setup-env.sh
```

### 4. ローカル開発

```bash
# 開発モードで起動
npm run dev

# ビルド
npm run build

# テスト実行
npm test

# リンター実行
npm run lint
```

## デプロイ

### 自動デプロイ（推奨）

mainブランチにプッシュすると、GitHub ActionsがCloud Runへ自動デプロイします。

```bash
git add .
git commit -m "feat: initial implementation"
git push origin main
```

### 手動デプロイ

```bash
# Docker イメージをビルド
docker build -t gcr.io/growth-force-project/web-pixel-billing-batch .

# Google Cloud にデプロイ
gcloud run deploy web-pixel-billing-batch \
  --image gcr.io/growth-force-project/web-pixel-billing-batch \
  --region asia-northeast1
```

## Cloud Scheduler設定

```bash
# スケジューラーを設定
./scripts/setup-scheduler.sh
```

## API エンドポイント

### `/processBilling` (POST)

メインの課金処理を実行します。Cloud Schedulerから呼び出されます。

### `/testBilling` (GET)

指定した日付の課金処理をテスト実行します。

```bash
curl "https://your-service-url/testBilling?date=2024-01-01"
```

## モニタリング

### Cloud Logging

```bash
# Cloud Run ログを確認
gcloud logs read "resource.type=cloud_run_revision" --limit=50

# Scheduler ログを確認
gcloud logs read "resource.type=cloud_scheduler_job" --limit=10
```

### BigQuery

```sql
-- 課金レコードを確認
SELECT 
  shop,
  billing_date,
  page_views,
  billing_amount,
  created_at
FROM `growth-force-project.billing.usage_records`
ORDER BY created_at DESC
LIMIT 10;
```

## 開発

### プロジェクト構造

```
src/
  ├── index.ts              # Cloud Run Function エントリーポイント
  ├── services/
  │   ├── bigquery.ts       # BigQuery データアクセス層
  │   └── billing.ts        # 課金計算ロジック
  └── types/
      └── billing.ts        # 型定義

scripts/
  ├── setup-env.sh          # 環境変数設定スクリプト
  └── setup-scheduler.sh    # Cloud Scheduler設定スクリプト

.github/workflows/
  └── deploy.yml            # 自動デプロイワークフロー
```

### 技術スタック

- **言語**: TypeScript
- **ランタイム**: Node.js 18
- **インフラ**: Google Cloud Platform
  - Cloud Run
  - Cloud Scheduler  
  - BigQuery
  - Container Registry
- **CI/CD**: GitHub Actions

## トラブルシューティング

### よくある問題

1. **認証エラー**
   - サービスアカウントキーが正しく設定されているか確認
   - BigQueryアクセス権限があるか確認

2. **スケジューラーが実行されない**
   - Cloud Scheduler APIが有効になっているか確認
   - ジョブが正しく作成されているか確認

3. **データが見つからない**
   - ソーステーブルが存在するか確認
   - 日付範囲が正しいか確認

### デバッグ

```bash
# テスト実行で動作確認
NODE_ENV=test npm run dev

# 特定の日付でテスト
curl "https://your-service-url/testBilling?date=YYYY-MM-DD"
```

## ライセンス

MIT