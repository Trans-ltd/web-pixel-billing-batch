# IAM権限設定ガイド

## エラーの解決方法

Cloud Functions (Gen2) のデプロイで以下のエラーが発生した場合：

```
ERROR: (gcloud.functions.deploy) ResponseError: status=[403], code=[Ok], message=[Permission 'run.services.setIamPolicy' denied on resource...
```

### 原因
GitHub ActionsのサービスアカウントにCloud Run関連の権限が不足しています。
Cloud Functions Gen2はCloud Run上で動作するため、追加の権限が必要です。

### 解決手順

1. **ローカルでGCPにログイン**
   ```bash
   gcloud auth login
   gcloud config set project growth-force-project
   ```

2. **権限設定スクリプトを実行**
   ```bash
   bash ./scripts/setup-iam-permissions.sh
   ```

   このスクリプトは以下のロールを付与します：
   - `roles/cloudfunctions.admin` - Cloud Functions管理権限
   - `roles/run.admin` - Cloud Run管理権限（Gen2に必要）
   - `roles/iam.serviceAccountUser` - サービスアカウント使用権限
   - `roles/storage.objectAdmin` - ストレージ権限
   - `roles/artifactregistry.writer` - Artifact Registry書き込み権限

3. **GitHub Actionsワークフローを再実行**
   - GitHubのActionsタブから失敗したワークフローを再実行
   - または新しいコミットをpush

### 権限の確認方法

```bash
gcloud projects get-iam-policy growth-force-project \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:github-actions-deploy@growth-force-project.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

### 注意事項
- これらの権限変更にはプロジェクトのオーナー権限またはIAM管理者権限が必要です
- 権限の付与後、反映まで数分かかる場合があります