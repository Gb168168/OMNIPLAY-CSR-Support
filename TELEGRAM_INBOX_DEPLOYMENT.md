# Telegram Bot 與 Conversation 收件匣：免費 Cloudflare 部署

此版本不使用 Firebase Functions、不需要 Blaze，也不需要綁信用卡。Telegram Bot 執行於 Cloudflare Workers；Conversation 儲存於 D1 免費額度。圖片、影片與文件保存 Telegram file_id，預覽時由 Worker 產生短效安全連結。

## 1. 建立 Cloudflare 免費帳號
前往 https://dash.cloudflare.com/sign-up 建立帳號。不要購買網域或付費方案。

## 2. 在專案開啟 PowerShell
進入專案根目錄後：
```powershell
cd cloudflare-worker
npm install
npx wrangler login
```
瀏覽器開啟後登入 Cloudflare 並允許 Wrangler。

## 3. 建立免費 D1
```powershell
npx wrangler d1 create omniplay-conversations --binding DB --update-config
npm run db:init
```
--update-config 會把 D1 的 database_id 自動寫入 wrangler.jsonc。

## 4. 設定四個 Secret
依序執行：
```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put INBOX_API_TOKEN
npx wrangler secret put INBOX_ADMIN_TOKEN
```
- TELEGRAM_BOT_TOKEN：貼 BotFather Token。
- TELEGRAM_WEBHOOK_SECRET：自行設定一組長隨機字串。
- INBOX_API_TOKEN：另一組不同的長隨機字串，之後首次開啟收件匣時使用。
- INBOX_ADMIN_TOKEN：只有管理員保存的獨立長隨機字串，用於永久刪除 Conversation。請勿提供給一般人員。
- 真正的值只貼在 PowerShell 提示中，不要貼到 GitHub 或聊天。

## 5. 部署
```powershell
npm run deploy
```
記下輸出的 Worker 網址，例如：https://omniplay-conversation-inbox.<帳號>.workers.dev

## 6. 設定 Telegram Webhook
在 PowerShell 執行（替換三個尖括號內容）：
```powershell
$body = @{
  url = "https://<WORKER網址>/telegram"
  secret_token = "<TELEGRAM_WEBHOOK_SECRET>"
  allowed_updates = @("message")
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" -ContentType "application/json" -Body $body
```
成功時會顯示 ok : True。

## 7. 連接 OMNIPLAY 收件匣
1. 開啟 OMNIPLAY → 📥 收件匣。
2. 首次會要求 Worker 網址，貼第 5 步網址。
3. 貼第 4 步設定的 INBOX_API_TOKEN。
4. 設定只保存在目前瀏覽器，不會寫入 GitHub。

## 使用
1. 客服連續轉傳文字、圖片、影片或文件給 Bot。
2. Bot 每則回覆「已暫存」。
3. 完成後輸入「執行」、「完成」或 /done。
4. Bot 建立 CONV-000001 並清空暫存。
5. 到收件匣預覽；按「AI分析」才會交給 Puter AI。
6. 按「匯入」帶入日誌 NEW，客服確認後儲存。

## 安全
- Bot Token 與兩個 Secret 只存在 Cloudflare Secret。
- Conversation 原始訊息不可由收件匣修改。
- 一般人員可使用收件匣；只有 OMNIPLAY 管理員搭配 INBOX_ADMIN_TOKEN 才可永久刪除。
- 封存不會刪除原始內容。
- 媒體預覽網址只有短時間有效。
- functions/ 僅保留舊 Firebase 版本參考，不需部署。
