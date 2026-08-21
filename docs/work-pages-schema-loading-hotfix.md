# 作業管理頁面「載入欄位中…」復原機制

## 問題

作業管理中走公司 API 的動態表單頁面（舊日誌、日誌 NEW、交接、提報）若 schema snapshot 沒有在合理時間內回來，`#newRecordButton` 會永久停留在「載入欄位中…」。對接追蹤未走這批 API 路由，因此不受同一問題影響。

## 修正

- 不修改 `assets/api.js` 的路由、token、base URL 或登入安全邏輯。
- 5 秒內 schema 正常載入：完全不介入。
- 超過 5 秒仍未 ready：先以該頁 `initRagicPage()` 已提供的 `config.fields` / `formLayout` 建立預設 schema，解除「載入欄位中…」，讓頁面可以先顯示欄位與操作。
- 後續正式 schema snapshot 若恢復，原本 `ragic-table.js` 的監聽仍會正常覆蓋成正式 schema。
- 對接追蹤、收件匣、PROD 告警及其他非指定頁面不套用此 fallback。

## 影響檔案

- `assets/ragic-schema-recovery.js`：新增 schema 卡住時的前端 fallback。
- `assets/reminders.js`：只在指定四個作業管理頁載入 recovery script。

影響範圍：只處理作業管理動態表單初始化卡在「載入欄位中…」的情況，不改資料來源與後端 API。

如改壞，revert 本 PR 即可完整還原。
