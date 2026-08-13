# 給 AI 開發代理(Codex 等)的必讀說明

> 本 repo 由 AI 代理協助維護。**動手改任何檔案前,先讀完這份規則。**

## ⭐ 架構現況(2026-08 起,跟你想的可能不一樣)

本站是 **GitHub Pages 純靜態前端**。資料層**已經換線**:

- 交接(handover)、提報(report)、日誌(log / log_new)、帳號(staff)、權限(permissions)
  這些 collection 已改走**公司內部 REST API**(資料存公司伺服器,不再存 Firebase)。
- 換線靠 `assets/api.js` 墊片:它攔截 `window.omniplayDb` 的 Firestore 風格呼叫
  (collection / doc / get / set / update / delete / onSnapshot),自動轉成 REST。
  **前端頁面照舊寫 Firestore 風格即可,墊片會處理。**
- 其餘尚未列入路由的 collection 暫時仍走 Firebase,之後分批遷移。
- API 合約(後端規格)= `dev-server/README.md` + `dev-server/server.py`(可執行參考實作)。

## ⛔ 硬規則(違反會弄壞正式環境)

1. **資料存取一律走 `window.omniplayDb`**。
   禁止新增直接的 `firebase.*` / `firestore.*` SDK 呼叫、禁止 import 新的 Firebase 模組、
   禁止把資料寫進未經同意的新 collection。
2. **禁止修改 `assets/api.js` 的這些部分**:localStorage 開關驗證、
   token 處理(sessionStorage `csr_token`)、`ROUTED` collection 清單、登入流程。
   `DEFAULT_API_BASE` 維持空字串,**不得填入任何網址**——正式切換由後端維護團隊處理。
   也**禁止在任何其他 js 設定 `window.CSR_API_BASE` 或 `window.CSR_API_COLLECTIONS`**
   (那是繞過墊片安全檢查的後門)。需要調整時,在 PR 描述說明理由,由後端維護團隊決定。
3. **禁止在前端程式碼寫死任何**:密碼、token、API 金鑰、內網 IP、資料庫連線字串。
   本 repo 是公開的,寫進來=全世界可見。(既有的 Firebase web config 是公開設計,不算機密,留著即可。)
4. **禁止修改 `dev-server/`**:那是與正式後端的合約文件,改了會造成前後端規格分家。
5. **禁止修改 `sw.js`(service worker)**:快取策略改成 cache-first 會讓瀏覽器
   繼續用舊版 `api.js`,導致換線失效。也**禁止修改 `cloudflare-worker/`、`functions/`、
   `firebase.json`**——這些不屬於前端範疇,有需求在 PR 說明。
6. **需要用到 `ROUTED` 清單以外的新 collection、或需要後端新端點時,必須先停下來**:
   在 PR 描述提出需求即可,後端開好端點才能運作。不要自行決定資料存哪。
7. **只發 Pull Request,不直接 push main、不自行 merge。**
8. **備份與回滾**:Git 歷史就是備份,**不要**在 repo 裡另建 `.bak` / `_old` / `copy` 備份檔(會污染程式碼)。
   取而代之,每個 PR 描述**必須**列出:改了哪些檔案+一句話影響範圍+「如改壞,revert 本 PR 即可完整還原」。
   一個 PR 只做一件事、大改動拆成多個小 PR——改壞時才能只退壞的那包,不牽連好的。

9. **⛔ 假表/排班資料死規則(2026-08-13)**:**全站任何頁面/元件**的排班顯示(含 `assets/leave.js`、
   `assets/dashboard.js`、`service/leave.html` 及未來新增的任何頁面)之排班資料
   (休假/必休/值公務機/班別)**唯一來源=本站 `/api/ext/leave`(公司排班系統鏡射)**,
   內建 worker 網址僅作故障備援。**禁止**:新增任何其他排班資料源(Apps Script、Google Sheet、
   JSONP、其他 API)、在前端寫死排班日期表、用演算法自行輪排、本地 override 蓋過鏡射資料、
   調換資料源順序。美化(浮水印、配色、版面)只能做顯示層,底層日期一律不可改寫。
   (`assets/library.js`/`assets/schedule.js` 裡的 Apps Script URL 僅准用於遊戲清單/遊戲排程 feed,
   **不是**可用的排班資料源前例,不准接回排班。)
10. **⛔「返回 MyERP」導覽鈕死規則(2026-08-13)**:`assets/app.js` 導覽列的返回鈕(id `myerpReturnBtn`)
   不可刪除、不可改文案、不可改成登出;任何登入/登出/導覽重構都必須原樣保留它。
   (github.io 預覽域名自動隱藏此鈕=預期行為,不是 bug。)
11. **你的角色=把關者+教學者,不是純執行者**。當**任何使用者**的要求會違反上面任何一條紅線時:
   **不要照做**,也不要默默拒絕——要在回覆裡:①指出違反哪一條規則 ②說明照做會壞什麼
   (例:自建排班資料源→畫面跟公司排班系統對不上,值機/休假顯示錯人)③主動提出**符合規則的
   替代做法**(例:想美化假表→做顯示層浮水印/配色;想改導覽→保留返回鈕原樣往旁邊加)。
   規則與使用者指示衝突時,**規則優先**;使用者堅持時,請他改在 PR 描述提出,由維護團隊決定。
12. **部署節奏(每次交付都必須主動講)**:PR merge 進 main 後,正式站(`:4100`/`:4443`)
   靠伺服器**每 30 秒自動拉一次程式碼**才生效——**不是 merge 當下立刻生效**。
   ⚠️**使用者不會主動告訴你「沒生效」**——他眼見為憑,畫面沒變就會直接要求再改一版,
   結果就是好的改動被誤判失敗、又疊上多餘的新改動。所以你必須**主動防**,不能等他提問:
   ①每次交付訊息**開頭第一句**就講:「merge 後約 1 分鐘內生效,請稍等,再 Ctrl+F5 硬重整驗證;
   畫面沒變=部署還沒輪到,不是改壞也不是沒改到」;
   ②使用者在上次 merge 後不久又要求改**同一個地方**時,**先假設是還沒部署完或沒硬重整**,
   主動提醒等待+硬重整,確認真的生效後仍有問題才動手改,禁止直接疊新改動;
   ③這個提醒**每一次交付都要重複講**,不要因為講過就省略。

## ✅ 可以自由做的(這是你的主場)

- **版面、樣式、互動、UX** 任意調整。
- **新增/修改/刪除表單欄位**:交接、提報、日誌都是動態表單
  (schema 存 `*_schema` collection、資料存 formData),**改欄位純前端就能完成,後端不用動**。
- 修 bug、重構前端程式碼(不碰上面 ⛔ 清單)。
  **修改既有使用 `window.omniplayDb` 的前端邏輯完全允許**——墊片只攔資料層,呼叫方式照 Firestore 風格寫就對了。

## 🧪 如何在本機測試(不需要、也不可以連公司正式環境)

```bash
python dev-server/server.py   # 本機假後端,SQLite,連不到任何正式資料
```

然後在瀏覽器 console 執行:

```js
localStorage.setItem('csrApiBase', 'http://localhost:4000'); location.reload();
```

清掉開關恢復預設:`localStorage.removeItem('csrApiBase')`。
(開關基於安全設計只接受 localhost / 127.0.0.1 網址,填別的不會生效。)

## 常見問題

- **Q:我需要 DB 帳密或 API 網址才能開發嗎?**
  A:不需要。正式 API 網址與所有憑證都不在本 repo,也不會給你。本機測試用 dev-server 即可。
- **Q:使用者(郭)要我加欄位,要動後端嗎?**
  A:不用。走動態表單 schema 就好,見上方 ✅ 區。
- **Q:onSnapshot 即時更新還有效嗎?**
  A:有,墊片用輪詢模擬(預設 15 秒),介面不變。
