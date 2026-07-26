# Conversation Rules 合併片段

請將以下片段合併進 Firebase Console 現有規則，不要整份覆蓋。

## Firestore
放入 `match /databases/{database}/documents` 內：
```
match /conversations/{id} {
  allow read: if request.auth != null;
  allow create, delete: if false;
  allow update: if request.auth != null &&
    request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'analysis','analyzed','analyzedAt','importDrafted','importDraftedAt',
      'imported','importedAt','importedLogId','archived','archivedAt'
    ]);
  match /messages/{messageId} {
    allow read: if request.auth != null;
    allow write: if false;
  }
}
```

## Storage
放入 `match /b/{bucket}/o` 內：
```
match /telegram-conversations/{allPaths=**} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

Bot 使用 Admin SDK，不受上述 client rules 限制。