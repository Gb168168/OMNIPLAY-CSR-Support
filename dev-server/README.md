# 客服系統後端 API 合約(第一階段:交接/提報/日誌 + 登入)

這份文件 + `server.py`(可執行的參考實作)= 前端需要的完整後端合約。
正式後端照這份實作,前端**一行都不用再改**,只要把 API 網址填進 `assets/api.js` 的開關。

## 背景

前端(本 repo,GitHub Pages)原本直連 Firebase Firestore。`assets/api.js` 墊片會把
**指定的 collection** 改走 REST API,其餘暫時留在 Firebase,分批遷移。

第一階段改走 API 的 collection:

| collection | 內容 | 備註 |
|---|---|---|
| `handover` / `handover_schema` | 交接紀錄 / 表格設計 | schema 供拖拉表單設計器用,文件 id 固定 `active` |
| `report` / `report_schema` | 需求&問題提報 | 同上 |
| `log` / `log_schema` | 日誌(舊版) | 同上 |
| `log_new` / `log_new_schema` | 日誌 NEW | 同上 |
| `staff` | 員工帳號 | 之後應對接 myerp.users;`password` 欄位正式版**不得**回傳給前端 |
| `permissions` | 每人頁面權限 | 文件 id = staff id |

## 端點

所有 `/api/csr/*` 都要帶 `Authorization: Bearer <token>`,沒帶或失效回 `401`。

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/auth/login` | `{account, password}` → `200 {token, staff:{id, code, name, account}}`;錯誤 `401`;停用帳號 `403` |
| GET | `/api/csr/:collection` | 全部文件 `[{id, ...欄位}]`(單一 collection 數百~數千筆,前端自己過濾排序) |
| GET | `/api/csr/:collection/:id` | 單一文件 `{id, ...欄位}`;不存在 `404` |
| POST | `/api/csr/:collection` | 新增,body = 欄位物件 → `{id}`(id 後端產) |
| PUT | `/api/csr/:collection/:id` | 整份覆蓋;**不存在則建立**(upsert,前端會先產 id 再 set) |
| PATCH | `/api/csr/:collection/:id` | 部分更新;不存在 `404`;**key 可含「.」= 巢狀欄位**(例 `pins.userId` 只更新該子欄位) |
| DELETE | `/api/csr/:collection/:id` | 刪除 → `204`(刪不存在的也回 `204`) |

## 約定

1. **serverTimestamp 哨兵**:body 中任何值為 `{"__serverTimestamp": true}`,後端以伺服器當下時間取代,存成 **ISO 8601 字串**(例 `2026-08-10T06:30:00+00:00`)。
2. **時間欄位一律回傳 ISO 8601 字串**(前端的格式化函式都能吃字串;`createdAt` 用字串排序也正確)。
3. **圖片/附件**:目前欄位內是壓縮過的 base64 字串,直接當一般欄位存(單筆可達數百 KB)。之後再議獨立上傳端點。
4. **CORS**:要允許 GitHub Pages 網域(`https://gb168168.github.io`)的跨域請求,含 `OPTIONS` preflight、`Authorization`/`Content-Type` header、上表全部方法。
5. **欄位不定**:拖拉表單設計器會動態長出欄位(key 如 `field_178xxxx`),後端**不要**用固定 schema 擋,照存照回即可(建議 JSON 欄位存法)。
6. **權限**:`permissions/{staffId}` 內容為 `{pages: {handover: {view, edit, delete, design}, ...}}`;帳號 `OMNIPLAY` 為管理員(前端自帶此判斷,正式版建議改由後端回傳角色)。

## ⛔ 正式後端的硬性要求(FRIDAY 審查 2026-08-10;dev-server 為求簡單未實作,正式版必做)

1. **必須 HTTPS**:前端在 GitHub Pages(https),瀏覽器強制封鎖 https 頁面對 http API 的請求(mixed content)— HTTP 直連根本不通。建議 Cloudflare Tunnel 或反代 + 憑證。
2. **登入防暴力破解**:`/api/auth/login` 驗的是 MyERP 全公司帳密,必須做「每 IP + 每帳號」限速與失敗鎖定(例:同帳號 5 次失敗鎖 15 分鐘),否則等於把公司帳號密碼掛公網給人猜,且 bcrypt 驗證吃 CPU、登入洪水=DoS。
3. **token 要過期**(建議 ≤12 小時)並提供 `POST /api/auth/logout` 撤銷;前端登出已會呼叫(沒有此端點也不會壞,但 token 會活到過期)。
4. **`staff` 永不回傳 `password` 欄位**(登入已走 MyERP,此欄位應整個不存在);`staff`/`permissions` 的寫入要限管理員身分,後端強制檢查,不能只靠前端藏按鈕。
5. **列表要輕量**:`GET /api/csr/:collection` 應剝除 base64 圖片/附件等重欄位(改回傳 `{attachment: {size, name}}` 之類的佔位,詳細另拉單筆),並支援 `?updatedSince=<ISO>` 增量查詢 — 前端每 15 秒輪詢全量,不做這條 NAS 頻寬會被打爆。

## 本地試跑

```
python dev-server/server.py          # http://localhost:4000
# 測試帳號:OMNIPLAY / dev123(管理員)、tester / dev123
# 前端撥開關(瀏覽器 console):
#   localStorage.setItem('csrApiBase', 'http://localhost:4000'); location.reload();
# 收開關:localStorage.removeItem('csrApiBase'); location.reload();
```

資料落在 `dev-server/data/*.json`,純測試用,不會碰任何正式系統。
