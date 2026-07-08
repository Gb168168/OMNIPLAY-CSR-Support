const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 初始化 Firebase Admin
if (!process.env.FIREBASE_KEY) {
  console.error("錯誤：找不到 FIREBASE_SERVICE_ACCOUNT 密碼設定！");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function syncFiles() {
  const docsDir = path.join(__dirname, 'docs');
  if (!fs.existsSync(docsDir)) {
    console.log("找不到 docs 資料夾，跳過同步。");
    return;
  }

  const files = fs.readdirSync(docsDir);

  for (const file of files) {
    if (file.endsWith('.md') || file.endsWith('.txt')) {
      const filePath = path.join(docsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const docId = file.replace(/\.[^/.]+$/, ""); // 用檔名當 ID

      // 記憶到 Firebase 的 documents 集合中
      await db.collection('documents').doc(docId).set({
        title: file,
        content: content,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`成功同步檔案: ${file}`);
    }
  }
}

syncFiles().catch(err => {
  console.error("同步過程中發生錯誤:", err);
  process.exit(1);
});
