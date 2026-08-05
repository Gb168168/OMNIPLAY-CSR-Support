# OMNIPLAY 背景提醒設定

這個 Worker 每分鐘檢查到期提醒，並透過 Firebase Cloud Messaging 推送到已註冊的手機。客服系統頁面關閉後仍可收到通知。

## Cloudflare 必要設定

在 `omniplay-conversation-inbox` Worker 的「Settings → Variables and Secrets」加入：

| 名稱 | 類型 | 內容 |
| --- | --- | --- |
| `REMINDER_SOURCE` | Variable | `firestore` |
| `FIREBASE_PROJECT_ID` | Variable | `omniplay-csr-support` |
| `FIREBASE_CLIENT_EMAIL` | Secret | Firebase 服務帳戶 JSON 的 `client_email` |
| `FIREBASE_PRIVATE_KEY` | Secret | Firebase 服務帳戶 JSON 的 `private_key` 完整內容 |

請勿將服務帳戶 JSON 或 Private Key 提交到 GitHub。

確認既有 D1 binding 名稱仍為 `DB`，並在 Worker 的「Triggers」加入 Cron：

```text
* * * * *
```

## iPhone 啟用方式

1. 使用 Safari 開啟客服系統。
2. 分享 → 加入主畫面。
3. 從主畫面開啟客服系統。
4. 第一次操作頁面時允許通知。

## 未來改用 NAS

將 `REMINDER_SOURCE` 改為 `nas`，並設定：

| 名稱 | 類型 | 內容 |
| --- | --- | --- |
| `NAS_REMINDER_API_URL` | Secret | NAS 提醒 API 的 HTTPS 網址 |
| `NAS_REMINDER_API_TOKEN` | Secret | NAS API Bearer Token（若有） |

NAS API 回傳格式：

```json
{
  "jobs": [
    {
      "id": "record-id",
      "module": "handover",
      "reminder_at": "2026-08-05T12:30:00+08:00",
      "title": "交接提醒",
      "body": "提醒內容",
      "url": "https://gb168168.github.io/OMNIPLAY-CSR-Support/work/handover.html?id=record-id"
    }
  ]
}
```

NAS 若只存在公司內網，需先透過 Cloudflare Tunnel 或其他安全方式提供 Worker 可存取的 HTTPS API。
