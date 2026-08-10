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
  // localStorage 開關只認 localhost(FRIDAY 8/10:防同 origin 其他專案 XSS 把 API 位址指到攻擊者伺服器)
  const stored = localStorage.getItem('csrApiBase') || '';
  const storedIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(stored);
  const base = ((storedIsLocal ? stored : '') || window.CSR_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
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
  const POLL_INTERVAL = Number(window.CSR_POLL_INTERVAL) || 15000; // onSnapshot 輪詢間隔(毫秒)

  // token 存 sessionStorage:跟登入 session 同生命週期,也縮小 XSS 竊取後的存活時間(FRIDAY 8/10)
  const authToken = () => sessionStorage.getItem('csr_token') || '';

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
    // 其他 FieldValue 哨兵(arrayUnion/increment/delete)墊片不支援,直接擋下以免序列化成垃圾寫進資料庫
    // (FRIDAY 8/10;目前只有排班 schedule 在用這些,而 schedule 不得路由 — 它還用到 batch/runTransaction)
    if (value && typeof value === 'object' && value._methodName && !isServerTimestamp(value)) {
      throw new Error('墊片不支援的 FieldValue:' + value._methodName + '(此 collection 不應路由到 API)');
    }
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
  const makeQuerySnapshot = (rows, changes) => {
    const docs = rows.map((row) => {
      const { id, ...fields } = row;
      return makeDocSnapshot(id, fields);
    });
    // docChanges:預設(一次性 get)視為全部新增;onSnapshot 輪詢時由呼叫端傳入真正的差異
    const changeList = changes || docs.map((doc) => ({ type: 'added', doc }));
    return { empty: docs.length === 0, size: docs.length, docs, forEach: (fn) => docs.forEach(fn), docChanges: () => changeList };
  };
  // 比對前後兩次輪詢,算出 Firestore 語意的 docChanges(added/modified/removed)
  const diffDocs = (prevMap, docs) => {
    const changes = [];
    const nextMap = new Map();
    for (const doc of docs) {
      const serialized = JSON.stringify(doc.data());
      nextMap.set(doc.id, serialized);
      if (!prevMap) { changes.push({ type: 'added', doc }); continue; }
      const previous = prevMap.get(doc.id);
      if (previous === undefined) changes.push({ type: 'added', doc });
      else if (previous !== serialized) changes.push({ type: 'modified', doc });
    }
    if (prevMap) {
      for (const [id, serialized] of prevMap) {
        if (!nextMap.has(id)) changes.push({ type: 'removed', doc: makeDocSnapshot(id, JSON.parse(serialized)) });
      }
    }
    return { changes, nextMap };
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
      const path = `/api/csr/${this._collection}/${encodeURIComponent(this.id)}`;
      const body = JSON.stringify(encodeData(data));
      if (options && options.merge) {
        const result = await apiFetch(path, { method: 'PATCH', body });
        // Firestore 的 set(merge) 是 upsert:文件不存在時要改用 PUT 建立,不能靜默吞掉(FRIDAY 8/10)
        if (result && result.__notFound) await apiFetch(path, { method: 'PUT', body });
        return;
      }
      await apiFetch(path, { method: 'PUT', body });
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
      let prevMap = null; // id -> 序列化資料,供 docChanges 差異比對
      return startPolling(async () => {
        const rows = await apiFetch(`/api/csr/${this._collection}`);
        const list = applyQuery(Array.isArray(rows) ? rows : [], this._filters, this._orders, this._limit);
        const baseSnapshot = makeQuerySnapshot(list);
        const { changes, nextMap } = diffDocs(prevMap, baseSnapshot.docs);
        prevMap = nextMap;
        const snapshot = makeQuerySnapshot(list, changes);
        return { payload: list, snapshot };
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
