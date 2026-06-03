# tdcs-dl Lambda handler

> PLAN_E7 M3：hello world handler（POST /clean + GET /jobs/{id}）
> PLAN_E9 才接入真實清洗邏輯（tdcs-clean.ts + nodejs-polars）

---

## 何時 build / push（M6 [USER_RUN]）

```bash
# 先確保 ECR repo 存在
aws ecr create-repository --repository-name tdcs-dl-cleaner --region us-east-1

# 然後 build + push
bash infra/lambda/build_and_push.sh
```

`build_and_push.sh` 做 4 件事：
1. `esbuild` 打包 `src/index.ts` → `dist/index.js`（CJS bundle、external polars + aws-sdk）
2. `docker build` 成 Lambda Container image
3. ECR login + tag + push
4. 提示 Terraform apply

---

## Handler API 規格

### POST /clean

| 項目 | 值 |
|---|---|
| Route | `POST /clean` |
| Request body | 任意 JSON（PLAN_E9 接清洗參數：gantries/yyyymm/outputDest）|
| Response 202 | `{ "job_id": "<uuid>" }` |
| S3 寫入 | `s3://<BUCKET>/jobs/<job_id>.json` = `{ job_id, status: "accepted", echo: <body>, timestamp: ISO8601 }` |

**PLAN_E9 擴充**：status 欄位改為 `queued → processing → done/error`、echo 替換為實際清洗任務參數與進度

### GET /jobs/{id}

| 項目 | 值 |
|---|---|
| Route | `GET /jobs/{id}` |
| Path param | `id` = job_id（UUID）|
| Response 200 | S3 jobs/<id>.json 全文（JSON）|
| Response 404 | `{ "error": "job not found", "id": "<id>" }` |
| Response 400 | `{ "error": "missing job id" }`（id 為空）|

---

## 為何 CJS（CommonJS）vs cli/ 的 ESM

`cli/` 用 `"type": "module"`（ESM），因為 ink + yoga-wasm-web 需要 ESM。

Lambda 用 CJS 原因：
- Lambda Node.js 20 runtime **預設 CJS**（不需 `"type": "module"`）
- esbuild `--format=cjs` 打包成單檔、runtime 直接 `require('./dist/index.js')`
- 避免 ESM top-level await + Lambda cold start 的計時問題
- 未來需要 ESM：改 `--format=esm` 並在 package.json 加 `"type": "module"` 即可

---

## 為何 esbuild --external:nodejs-polars + @aws-sdk/*

- `nodejs-polars`：native .node addon，esbuild 不能 bundle → 放 node_modules；Lambda image 已 `npm ci` 裝好
- `@aws-sdk/*`：Lambda Node 20 runtime **內建 AWS SDK v3**（不需打包）、bundle 進去反而增加 image size
- esbuild bundle 主要是把 `src/index.ts` + uuid 打成一個小檔（< 100 KB），其餘依賴走 node_modules

---

## env vars（Terraform 設定，見 lambda.tf）

| 變數 | 來源 | 說明 |
|---|---|---|
| `BUCKET_NAME` | `var.bucket_name` | S3 bucket（寫 jobs/）|
| `AWS_REGION` | Lambda runtime 自動注入 | S3Client region |
