# Microsoft Teams Conversation Bot V1 部署指南

本版本沿用既有 Cloudflare D1 的 `drafts`、`draft_messages`、`conversations`、`messages` 與 OMNIPLAY 收件匣。Teams 不建立另一套 Conversation schema，也不執行 AI；建立後的 AI 分析與「日誌 NEW」匯入完全走現有流程。

> 重要：Firebase Functions（第 2 代）部署需要 Firebase 專案啟用 Blaze 帳單方案。程式本身沒有付費 API，但 Functions、Storage 與網路流量仍依 Firebase 免費額度/計價規則運作。若專案必須完全不綁帳單，不能使用這份 Firebase Functions 部署方式。

## 0. 架構與資料流

1. Teams 將 Bot Framework Activity POST 到 Firebase `teamsWebhook`。
2. Function 驗證 Microsoft Bot 身分，下載附件並保存至 Firebase Storage。
3. Function 使用 `TEAMS_INGEST_TOKEN` 呼叫 Conversation Worker 的 internal API。
4. Worker 以 `teams:<Entra user id>` 作為草稿鍵，寫入既有 D1 tables。
5. 輸入「執行」時，Worker 建立來源為 `teams`、顯示名稱為 `Microsoft Teams` 的 Conversation。
6. 現有收件匣讀取同一個 `/api/conversations`，後續 AI 與日誌匯入不分來源。

## 1. Microsoft Entra ID App Registration

1. 進入 Azure Portal → **Microsoft Entra ID** → **App registrations** → **New registration**。
2. Name：`OMNIPLAY-CSR-Support Teams Bot`。
3. Supported account types：選 **Accounts in this organizational directory only (Single tenant)**。
4. Redirect URI 留白，按 Register。
5. 記下：
   - Application (client) ID → `TEAMS_APP_ID`
   - Directory (tenant) ID → `TEAMS_TENANT_ID`
6. 進入 **Certificates & secrets** → **Client secrets** → New client secret。
7. 只複製一次 Secret 的 **Value**（不是 Secret ID）→ `TEAMS_APP_PASSWORD`。
8. 不要把 ID/Secret 寫進 manifest 以外的程式碼、GitHub、截圖或聊天。Tenant ID 與 Client ID 雖不是密碼，本專案仍統一用 Secret 管理。

V1 不讀取全公司聊天，也不需要 Microsoft Graph application permissions。未來若加入 change notifications，請做獨立 connector 模組，仍輸出相同 normalized Conversation payload。

## 2. 建立 Azure Bot

1. Azure Portal → Create a resource → 搜尋 **Azure Bot**。
2. Bot handle：例如 `omniplay-csr-support`。
3. Type of App：**Single Tenant**。
4. Microsoft App ID：選 Use existing app registration，貼上前一步的 Client ID。
5. Tenant ID：貼上 Directory (tenant) ID。
6. 建立後進入 **Configuration**。
7. Messaging endpoint 先留待 Firebase 部署完成，再填：
   `https://asia-east1-<FIREBASE_PROJECT_ID>.cloudfunctions.net/teamsWebhook`
8. Channels → Microsoft Teams → Configure/Save。

## 3. 建立共用 internal API 金鑰

在 PowerShell 產生一次，值不要顯示或提交：

```powershell
$teamsIngestKey = "TEAMS_" + [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
$teamsIngestKey | Set-Clipboard
```

到 `cloudflare-worker` 目錄，把同一個值存入 Worker：

```powershell
npx wrangler secret put TEAMS_INGEST_TOKEN
npm run deploy
```

Wrangler 出現 `Enter a secret value` 時貼上並按 Enter。

## 4. Firebase Secrets 與部署

進入專案根目錄。每個指令都會出現輸入提示，請直接貼值，不要把值接在命令後面：

```powershell
firebase functions:secrets:set TEAMS_APP_ID
firebase functions:secrets:set TEAMS_APP_PASSWORD
firebase functions:secrets:set TEAMS_TENANT_ID
firebase functions:secrets:set CONVERSATION_WORKER_URL
firebase functions:secrets:set TEAMS_INGEST_TOKEN
```

各值：
- `CONVERSATION_WORKER_URL`：`https://omniplay-conversation-inbox.omniplaycsr168168.workers.dev`
- `TEAMS_INGEST_TOKEN`：第 3 步产生、并已存入 Wrangler 的完全相同值。
- 其餘三個值來自 Entra App Registration。

安裝與部署：

```powershell
cd functions
npm install
cd ..
firebase use omniplay-csr-support
firebase deploy --only functions:teamsWebhook
```

部署結果會顯示 Function URL。把該網址填回 Azure Bot 的 Messaging endpoint。

Storage 必須已建立 default bucket；Firebase Console → Storage → Get started。附件物件保存在 `teams-conversations/`。目前使用不可猜測的 Firebase download token 供既有靜態收件匣預覽，若 token 外洩可在 Storage metadata 撤銷/重建。

## 5. Teams App Manifest 與安裝

1. 複製 `teams-app/manifest.json`。
2. 將兩處 `{{TEAMS_APP_ID}}` 換成 Client ID。
3. 將 `{{FIREBASE_PROJECT_ID}}` 換成 Firebase project ID。
4. 準備：
   - `color.png`：192 × 192 PNG
   - `outline.png`：32 × 32 透明背景白色輪廓 PNG
5. 將 `manifest.json`、`color.png`、`outline.png` 三個檔案直接壓成 ZIP（ZIP 根目錄不能再包一層資料夾）。
6. Teams → Apps → Manage your apps → Upload an app → Upload a custom app。
7. 若看不到 Upload，請請 Microsoft 365/Teams 管理員在 Teams admin center 允許 custom app upload，並允許此 Azure Bot app。

## 6. V1 操作與測試

在 Teams 與 Bot 的個人聊天依序測試：

1. 傳送文字、圖片、影片與文件。每次應回覆：`已收到 X 則訊息。完成後請輸入「執行」。`
2. 輸入 `狀態`：應顯示暫存訊息與附件數。
3. 輸入 `取消`：只清除目前 Teams 使用者的草稿。
4. 再傳兩則內容，輸入 `執行`：應回覆：
   - `已收到 2 則訊息`
   - `Conversation CONV-xxxxxx 已建立`
5. OMNIPLAY → 收件匣 → 來源選 Microsoft Teams → 預覽。
6. 按 AI 分析、匯入，確認沿用原本 Telegram Conversation 的同一流程。
7. 用第二個 Teams 帳號交錯測試「狀態」，兩人的數量必須不同。

Worker API 快速檢查：

```powershell
$workerUrl = "https://omniplay-conversation-inbox.omniplaycsr168168.workers.dev"
Invoke-RestMethod -Uri "$workerUrl/api/conversations" -Headers @{Authorization="Bearer $inboxKey"} |
  Where-Object {$_.source -eq "teams"}
```

## 7. 常見錯誤

- **401/403 from Azure Bot**：App ID、Tenant ID、Client Secret Value 不一致，或 Azure Bot 不是 Single Tenant。重新设置 Firebase secrets 后必须重新 deploy。
- **Conversation Worker 401**：Firebase 的 `TEAMS_INGEST_TOKEN` 與 Wrangler secret 不同。兩邊重新輸入同一值並各自部署。
- **Bot 沒回覆**：Azure Bot Messaging endpoint URL 錯誤、Function 未部署、Teams channel 未啟用。先看 Firebase Functions logs。
- **附件下載 401/403**：Client Secret 過期、Teams file consent/下載資訊不完整，或 Storage 未建立。重新建立 Secret Value 後部署。
- **附件在收件匣破圖**：檢查 Storage object 是否存在及 metadata 的 `firebaseStorageDownloadTokens`；不要直接保存 Teams 的短效 `downloadUrl`。
- **Teams 無法上傳自訂 App**：Teams admin center 的 app setup / permission policy 未允許 custom app。
- **Firebase 要求 Blaze**：第 2 代 Functions 正常需要帳單方案；若不接受，需改用 Cloudflare Workers + R2 的另一個部署版本，不能只靠 Firebase Spark。
- **Node engine warning**：本專案指定 Node 20；使用相容的 Firebase CLI，执行 `node -v`、`firebase --version` 检查。
- **Bot Framework SDK 驗證錯誤**：不要自行關閉 JWT 驗證；確認 Azure Bot 與 Entra registration 的 App ID/Tenant 一致。

## 8. 安全與維運

- Secret 一律只放 Firebase Secret Manager / Wrangler secret。
- Client Secret 到期前輪替：新增新 secret → 更新 Firebase secret → deploy → 再撤銷舊 secret。
- `TEAMS_INGEST_TOKEN` 可獨立輪替，不影響使用者的收件匣存取碼。
- Teams Bot 只收集與建立 Conversation，不做 AI、不判斷客戶、案件、分類或狀態。
- 未來 Graph change notifications 建議新增 `functions/teams-graph.js`，最後仍呼叫相同 internal ingestion API。

## 9. 新增及修改檔案

新增：
- `functions/teams-bot.js`
- `teams-app/manifest.json`
- `MICROSOFT_TEAMS_DEPLOYMENT.md`

修改：
- `functions/index.js`
- `functions/package.json`
- `cloudflare-worker/src/worker.js`
- `assets/inbox.js`
- `work/inbox.html`

未修改：
- `cloudflare-worker/schema.sql`（Teams 直接共用既有 schema）
- Telegram 的資料表與收件匣 AI/匯入 API。
