// 後端切換墊片(2026-08-10 小賈/中魁 session 建立)
// 目的:把指定的 collection 從 Firebase Firestore 改走公司內部 REST API,
//       其餘 collection 照走 Firebase —— 讓遷移可以一批一批來,前端頁面完全不用改。
//
// 開關(CSR_API_BASE)沒撥時,這支檔案什麼都不做,行為與現況 100% 相同。
//
// 撥開關的方式(擇一):
//   1. 正式:改下面 DEFAULT_API_BASE 為公司 API 網址(例 'https://erp.example.com')
//   2. 測試:瀏覽器 console 執行 localStorage.setItem('csrApiBase', 'http://localhost:4000') 後重新整理
//
// API 合約(後端需實作,詳見 dev-server/README.md):
//   POST   /api/auth/login                {account, password} -> {token, staff:{id, code, name, account}}
//   GET    /api/csr/:collection           -> [{id, ...fields}]
//   GET    /api/csr/:collection/:id       -> {id, ...fields}(404 = 不存在)
//   POST   /api/csr/:collection           {fields} -> {id}
//   PUT    /api/csr/:collection/:id       {fields}(整份覆蓋,不存在則建立)
//   PATCH  /api/csr/:collection/:id       {fields}(部分更新;key 可含「.」= 巢狀欄位)
//   DELETE /api/csr/:collection/:id
//   值為 {"__serverTimestamp": true} 時,後端以伺服器當下時間(ISO 8601 字串)取代。
//   時間欄位一律回傳 ISO 8601 字串(前端各格式化函式已能解析字串)。

(function () {
  'use strict';

  const DEFAULT_API_BASE = ''; // ← 正式切換時填公司 API 網址;空字串 = 維持 Firebase
  const base = (localStorage.getItem('csrApiBase') || window.CSR_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
  window.CSR_API_BASE = base;
  if (!base) return; // 開關沒撥:不做任何事

  // 第一階段改走 API 的 collection(交接/提報/日誌 + 帳號權限;其餘照走 Firebase)
  const ROUTED = new Set(window.CSR_API_COLLECTIONS || [
    'handover', 'handover_schema',
    'report', 'report_schema',
    'log', 'log_schema',
    'log_new', 'log_new_schema',
    'staff', 'permissions'
  ]);

  const realDb = window.omniplayDb; // Firebase 原本的 Firestore(未路由的 collection 繼續用)
  const POLL_INTERVAL = 15000;      // onSnapshot 以輪詢模擬的間隔(毫秒)

  const authToken = () => localStorage.getItem('csr_token') || '';

  async function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = authToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (response.status === 404) return { __notFound: true };
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(body.error || ('API ' + response.status));
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  // ---- serverTimestamp 哨兵偵測(相容 Firebase compat SDK 的 FieldValue)----
  const isServerTimestamp = (value) => {
    if (!value || typeof value !== 'object') return false;
    if (value.__serverTimestamp === true) return true;
    const method = value._methodName || value.Hc || '';
    if (String(method).toLowerCase().includes('servertimestamp')) return true;
    try {
      const FieldValue = window.firebase?.firestore?.FieldValue;
      if (FieldValue && typeof value.isEqual === 'function') return value.isEqual(FieldValue.serverTimestamp());
    } catch (_) { /* 非 FieldValue,略過 */ }
    return false;
  };

  const encodeValue = (value) => {
    if (isServerTimestamp(value)) return { __serverTimestamp: true };
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value.toDate === 'function') return value.toDate().toISOString(); // Firestore Timestamp
    if (Array.isArray(value)) return value.map(encodeValue);
    if (value && typeof value === 'object' && value.constructor === Object) {
      const out = {};
      for (const [key, val] of Object.entries(value)) out[key] = encodeValue(val);
      return out;
    }
    return value;
  };
  const encodeData = (data) => encodeValue(data || {});

  // ---- 快照物件(相容 Firestore snapshot 介面)----
  const deepCopy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const makeDocSnapshot = (id, data) => ({
    id,
    exists: data != null,
    data: () => data == null ? undefined : deepCopy(data)
  });
  const makeQuerySnapshot = (rows) => {
    const docs = rows.map((row) => {
      const { id, ...fields } = row;
      return makeDocSnapshot(id, fields);
    });
    return { empty: docs.length === 0, size: docs.length, docs, forEach: (fn) => docs.forEach(fn) };
  };

  // ---- client-side 查詢(資料量小,抓回來後在前端過濾/排序)----
  const compareValues = (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  };
  const matchFilter = (value, op, target) => {
    switch (op) {
      case '==': return value === target;
      case '!=': return value !== target;
      case '<': return compareValues(value, target) < 0;
      case '<=': return compareValues(value, target) <= 0;
      case '>': return compareValues(value, target) > 0;
      case '>=': return compareValues(value, target) >= 0;
      case 'in': return Array.isArray(target) && target.includes(value);
      case 'array-contains': return Array.isArray(value) && value.includes(target);
      default: throw new Error('墊片不支援的查詢運算子:' + op);
    }
  };
  const applyQuery = (rows, filters, orders, limitCount) => {
    let result = rows.filter((row) => filters.every(([field, op, target]) => matchFilter(row[field], op, target)));
    for (let i = orders.length - 1; i >= 0; i--) {
      const [field, direction] = orders[i];
      result = [...result].sort((a, b) => (direction === 'desc' ? -1 : 1) * compareValues(a[field], b[field]));
    }
    if (limitCount != null) result = result.slice(0, limitCount);
    return result;
  };

  // ---- 輪詢模擬 onSnapshot ----
  const startPolling = (fetchOnce, onNext, onError) => {
    let lastPayload = null;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const { payload, snapshot } = await fetchOnce();
        if (stopped) return;
        const serialized = JSON.stringify(payload);
        if (serialized !== lastPayload) {
          lastPayload = serialized;
          onNext(snapshot);
        }
      } catch (error) {
        if (!stopped && typeof onError === 'function') onError(error);
        else if (!stopped) console.warn('[csr-api] 輪詢失敗:', error.message);
      }
    };
    tick();
    const timer = setInterval(tick, POLL_INTERVAL);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', onFocus); };
  };

  // Firestore 風格的隨機文件 ID(20 碼英數)
  const generateId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    const random = crypto.getRandomValues(new Uint8Array(20));
    for (let i = 0; i < 20; i++) id += chars[random[i] % chars.length];
    return id;
  };

  function RestDocRef(collectionName, id) {
    this._collection = collectionName;
    this.id = id;
  }
  RestDocRef.prototype = {
    get path() { return this._collection + '/' + this.id; },
    async get() {
      const data = await apiFetch(`/api/csr/${this._collection}/${encodeURIComponent(this.id)}`);
      if (data && data.__notFound) return makeDocSnapshot(this.id, null);
      const { id, ...fields } = data || {};
      return makeDocSnapshot(this.id, fields);
    },
    async set(data, options) {
      const method = options && options.merge ? 'PATCH' : 'PUT';
      await apiFetch(`/api/csr/${this._collection}/${encodeURIComponent(this.id)}`, { method, body: JSON.stringify(encodeData(data)) });
    },
    async update(data) {
      const result = await apiFetch(`/api/csr/${this._collection}/${encodeURIComponent(this.id)}`, { method: 'PATCH', body: JSON.stringify(encodeData(data)) });
      if (result && result.__notFound) throw new Error('文件不存在:' + this.path);
    },
    async delete() {
      await apiFetch(`/api/csr/${this._collection}/${encodeURIComponent(this.id)}`, { method: 'DELETE' });
    },
    onSnapshot(onNext, onError) {
      return startPolling(async () => {
        const snapshot = await this.get();
        return { payload: snapshot.exists ? snapshot.data() : null, snapshot };
      }, onNext, onError);
    }
  };

  function RestQuery(collectionName, filters, orders, limitCount) {
    this._collection = collectionName;
    this._filters = filters || [];
    this._orders = orders || [];
    this._limit = limitCount != null ? limitCount : null;
  }
  RestQuery.prototype = {
    where(field, op, value) { return new RestQuery(this._collection, [...this._filters, [field, op, value]], this._orders, this._limit); },
    orderBy(field, direction) { return new RestQuery(this._collection, this._filters, [...this._orders, [field, direction || 'asc']], this._limit); },
    limit(count) { return new RestQuery(this._collection, this._filters, this._orders, count); },
    async get() {
      const rows = await apiFetch(`/api/csr/${this._collection}`);
      const list = Array.isArray(rows) ? rows : [];
      return makeQuerySnapshot(applyQuery(list, this._filters, this._orders, this._limit));
    },
    onSnapshot(onNext, onError) {
      return startPolling(async () => {
        const snapshot = await this.get();
        return { payload: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })), snapshot };
      }, onNext, onError);
    }
  };

  function RestCollectionRef(collectionName) {
    RestQuery.call(this, collectionName);
  }
  RestCollectionRef.prototype = Object.create(RestQuery.prototype);
  RestCollectionRef.prototype.doc = function (id) { return new RestDocRef(this._collection, id || generateId()); };
  RestCollectionRef.prototype.add = async function (data) {
    const result = await apiFetch(`/api/csr/${this._collection}`, { method: 'POST', body: JSON.stringify(encodeData(data)) });
    return new RestDocRef(this._collection, result.id);
  };

  // ---- 混合資料庫:路由表內走 REST,其餘照走 Firebase ----
  window.omniplayDb = {
    collection: (name) => ROUTED.has(name) ? new RestCollectionRef(name) : realDb?.collection(name),
    // 交易/批次目前只有排班(schedule,未路由)在用,直接轉交 Firebase
    batch: () => realDb?.batch(),
    runTransaction: (fn) => realDb?.runTransaction(fn)
  };
  window.csrApiFetch = apiFetch; // 給 app.js 登入用
  console.info('[csr-api] 後端切換已啟用:', base, '路由 collection:', [...ROUTED].join(', '));
})();
