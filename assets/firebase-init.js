const firebaseConfig = {
  apiKey: "AIzaSyB5GdlMKz809ITGf7fMpDsYPVFnDAdnh-0",
  authDomain: "omniplay-csr-support.firebaseapp.com",
  projectId: "omniplay-csr-support",
  storageBucket: "omniplay-csr-support.appspot.com",
  messagingSenderId: "248758412651",
  appId: "1:248758412651:web:d417fb1956442170bc182e",
  measurementId: "G-RSCV4ZGTQH"
};

if (window.firebase?.apps && !window.firebase.apps.length) {
  window.firebase.initializeApp(firebaseConfig);
}

if (window.firebase?.analytics?.isSupported) {
  window.firebase.analytics.isSupported().then((supported) => {
    if (supported) window.firebase.analytics();
  });
}

window.omniplayDb = window.firebase?.firestore ? window.firebase.firestore() : null;
window.omniplayStorage = window.firebase?.storage ? window.firebase.storage() : null;

// ---- 移除 Firebase 第 1 段(2026-10-05):時間戳相容層 ----
// 各頁存檔時呼叫 `firebase.firestore.FieldValue.serverTimestamp()`(共 34 處)。
// 已走後端 API 的資料,api.js 會把它轉成 `{ __serverTimestamp: true }`,由後端填伺服器時間。
// Firebase SDK 拿掉後這個呼叫會直接報錯 → 這裡只在 SDK 的 FieldValue 不存在時補上,
// 回傳後端本來就認得的同一個標記;SDK 還在時完全不生效,行為零改變。
// ⛔ 刻意不補 delete / arrayUnion / Timestamp:只有 schedule.js 用,必須先改寫(第 2 段)才能拿掉 SDK。
if (!window.firebase?.firestore?.FieldValue?.serverTimestamp) {
  window.firebase = window.firebase || {};
  window.firebase.firestore = window.firebase.firestore || {};
  window.firebase.firestore.FieldValue = window.firebase.firestore.FieldValue || {};
  window.firebase.firestore.FieldValue.serverTimestamp = () => ({ __serverTimestamp: true });
}
