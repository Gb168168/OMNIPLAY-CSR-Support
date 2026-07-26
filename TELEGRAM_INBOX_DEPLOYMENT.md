# Telegram Bot 與 Conversation 收件匣部署

## 已新增
- `work/inbox.html`：📥 收件匣
- `assets/inbox.js`：收件匣資料、預覽、AI、匯入與封存
- `functions/index.js`：Telegram webhook
- `functions/package.json`：Firebase Functions Node 20
- `CONVERSATION_RULES_SNIPPET.md`：需合併至現有 Rules 的安全片段
- `work/log-new.html`：Conversation 草稿匯入與儲存後回寫

## Firebase 準備
1. 安裝 Node.js 20。
2. 安裝 CLI：`npm install -g firebase-tools`
3. 登入：`firebase login`
4. 根目錄執行：`firebase use --add omniplay-csr-support`
5. Firebase Console → Authentication → Sign-in method → 啟用 Anonymous。
6. 依 `CONVERSATION_RULES_SNIPPET.md` 將規則片段合併到現有 Firestore 與 Storage Rules，請勿覆蓋其他集合規則。

## Secret
```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
```

`TELEGRAM_WEBHOOK_SECRET` 請使用隨機長字串，不要與 Bot Token 相同。

## 部署 Functions
```bash
firebase deploy --only functions
```

## 設定 Telegram Webhook
```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://asia-east1-omniplay-csr-support.cloudfunctions.net/telegramWebhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

檢查：
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

## 使用
1. 客服連續轉傳文字、圖片、影片、文件。
2. Bot 每則回覆「已暫存」。
3. 完成後輸入「執行」、「完成」或 `/done`。
4. Bot 建立 `CONV-000001` 格式的 Conversation 並清空該客服暫存。
5. OMNIPLAY → 📥 收件匣 → 預覽。
6. 按「AI分析」才會分析；Bot 本身不分析。
7. 按「匯入」進入日誌 NEW 草稿。
8. 客服確認並儲存後，Conversation 才標記為已匯入。

## 資料模型
- `telegram_drafts/{telegramUserId}`：尚未執行的暫存批次
- `telegram_drafts/{telegramUserId}/messages/{sequence}`：暫存訊息
- `conversations/{conversationId}`：Conversation 狀態與 AI 結果
- `conversations/{conversationId}/messages/{sequence}`：永久原始訊息
- `telegram-conversations/...`：私人 Storage 媒體
- `system_counters/conversations`：Conversation 顯示編號

## 注意
- Conversation 原始訊息前端唯讀。
- 收件匣「封存」不會刪除原始資料。
- Bot Token 只存在 Firebase Secret。
- GitHub Pages 不保存 Bot Token。
