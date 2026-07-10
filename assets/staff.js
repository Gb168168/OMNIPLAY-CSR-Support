const staffCollection = window.omniplayDb?.collection('staff');
const staffTableBody = document.querySelector('#staffTableBody');
const staffForm = document.querySelector('#staffForm');
const staffModal = document.querySelector('#staffModal');
const modalTitle = document.querySelector('#staffModalTitle');
const formMessage = document.querySelector('#staffFormMessage');
const emptyState = document.querySelector('#staffEmptyState');
const addButton = document.querySelector('#addStaffButton');
const cancelButton = document.querySelector('#cancelStaffButton');
const closeButton = document.querySelector('#closeStaffModal');
const submitButton = document.querySelector('#saveStaffButton');
const passwordInput = document.querySelector('#staffPassword');
const passwordToggle = document.querySelector('#staffPasswordToggle');
const staffShiftInput = document.querySelector('#staffShift');

let editingStaffId = null;
let visiblePasswordRows = new Set();
let staffCache = [];

const setMessage = (message, type = 'error') => {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.dataset.type = type;
  formMessage.hidden = !message;
};

const toggleModal = (isOpen) => {
  staffModal?.classList.toggle('is-open', isOpen);
  staffModal?.setAttribute('aria-hidden', String(!isOpen));
  if (!isOpen) {
    staffForm?.reset();
    editingStaffId = null;
    setMessage('');
    if (passwordInput) passwordInput.type = 'password';
    if (passwordToggle) passwordToggle.textContent = '👁️';
  }
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}[char]));

const fixedStaffOrder = ['中魁', '佳臻', '晴心', '澄希', '茗雅'];
const fixedStaffOrderMap = fixedStaffOrder.reduce((map, name, index) => ({ ...map, [name]: index + 1 }), {});
const getDefaultSortOrder = (name) => fixedStaffOrderMap[name] ?? 999;
const maskPassword = (password = '') => password ? '**' : '—';

const renderStaff = (staffList) => {
  staffCache = staffList;
  if (!staffTableBody) return;

  emptyState.hidden = staffList.length > 0;
  staffTableBody.innerHTML = staffList.map((staff) => {
    const passwordVisible = visiblePasswordRows.has(staff.id);
    const passwordText = passwordVisible ? staff.password : maskPassword(staff.password);
    const protectedOmniplay = isProtectedOmniplay(staff);

    return `
      <tr class="${staff.status === '停用' ? 'is-disabled' : ''}">
        <td>${escapeHtml(staff.code)}</td>
        <td>${escapeHtml(staff.name)}</td>
        <td>${escapeHtml(staff.account)}</td>
        <td>
          <div class="password-cell">
            <span>${escapeHtml(passwordText)}</span>
            <button class="icon-button" type="button" data-action="toggle-password" data-id="${staff.id}" aria-label="切換密碼顯示">${passwordVisible ? '🙈' : '👁️'}</button>
          </div>
        </td>
        <td>${escapeHtml(staff.shift || '早班')}</td>
        <td><span class="status-badge ${staff.status === '停用' ? 'is-disabled' : 'is-enabled'}">${escapeHtml(staff.status || '啟用')}</span></td>
        <td>
          <div class="table-actions">
            ${protectedOmniplay ? '' : `<button class="secondary-button" type="button" data-action="toggle-status" data-id="${staff.id}">${staff.status === '停用' ? '啟用' : '停用'}</button>`}
            <button class="secondary-button" type="button" data-action="edit" data-id="${staff.id}">編輯</button>
            ${protectedOmniplay || !window.isOmniplayAdmin?.() ? '' : `<button class="secondary-button" type="button" data-action="permissions" data-id="${staff.id}">⚙️ 權限管理</button>`}
            ${protectedOmniplay ? '' : `<button class="danger-button" type="button" data-action="delete" data-id="${staff.id}">刪除</button>`}
          </div>
        </td>
      </tr>`;
  }).join('');
};

const openCreateModal = () => {
  editingStaffId = null;
  modalTitle.textContent = '新增人員';
  submitButton.textContent = '儲存人員';
  toggleModal(true);
  document.querySelector('#staffCode')?.focus();
};

const openEditModal = (staffId) => {
  const staff = staffCache.find((item) => item.id === staffId);
  if (!staff) return;

  editingStaffId = staffId;
  modalTitle.textContent = '編輯人員';
  submitButton.textContent = '更新人員';
  document.querySelector('#staffCode').value = staff.code || '';
  document.querySelector('#staffName').value = staff.name || '';
  document.querySelector('#staffAccount').value = staff.account || '';
  document.querySelector('#staffPassword').value = staff.password || '';
  if (staffShiftInput) staffShiftInput.value = staff.shift || '早班';
  toggleModal(true);
};

const loadStaff = () => {
  if (!staffCollection) {
    renderStaff([]);
    setMessage('Firebase 尚未完成初始化，請確認 firebase-init.js 是否已載入。');
    return;
  }

  staffCollection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    const staffList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderStaff(staffList);
  }, (error) => {
    console.error('讀取人員資料失敗：', error);
    renderStaff([]);
    setMessage('讀取人員資料失敗，請稍後再試。');
  });
};

staffForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!staffCollection) return setMessage('Firebase 尚未完成初始化，無法儲存資料。');

  const payload = {
    code: document.querySelector('#staffCode').value.trim(),
    name: document.querySelector('#staffName').value.trim(),
    account: document.querySelector('#staffAccount').value.trim(),
    password: document.querySelector('#staffPassword').value.trim(),
    shift: staffShiftInput?.value || '早班',
    sortOrder: getDefaultSortOrder(document.querySelector('#staffName').value.trim()),
    status: '啟用',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!payload.code || !payload.name || !payload.account || !payload.password) {
    setMessage('請完整填寫編號、姓名、帳號與密碼。');
    return;
  }

  submitButton.disabled = true;
  setMessage('儲存中...', 'info');

  try {
    if (editingStaffId) {
      const currentStaff = staffCache.find((item) => item.id === editingStaffId);
      await staffCollection.doc(editingStaffId).update({
        ...payload,
        status: isProtectedOmniplay(currentStaff) ? '啟用' : (currentStaff?.status || '啟用'),
        sortOrder: currentStaff?.sortOrder ?? payload.sortOrder
      });
    } else {
      await staffCollection.add({
        ...payload,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    toggleModal(false);
  } catch (error) {
    console.error('儲存人員資料失敗：', error);
    setMessage('儲存失敗，請稍後再試。');
  } finally {
    submitButton.disabled = false;
  }
});

staffTableBody?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === 'toggle-password') {
    visiblePasswordRows.has(id) ? visiblePasswordRows.delete(id) : visiblePasswordRows.add(id);
    renderStaff(staffCache);
    return;
  }

  if (action === 'edit') {
    openEditModal(id);
    return;
  }

  if (action === 'permissions') {
    await openPermissionManager(id);
    return;
  }

  if (action === 'toggle-status' && staffCollection) {
    const staff = staffCache.find((item) => item.id === id);
    if (!staff || isProtectedOmniplay(staff)) return;

    try {
      await staffCollection.doc(id).update({
        status: staff.status === '停用' ? '啟用' : '停用',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('更新人員狀態失敗：', error);
      alert('更新狀態失敗，請稍後再試。');
    }
    return;
  }

  if (action === 'delete' && staffCollection && !isProtectedOmniplay(staffCache.find((item) => item.id === id)) && confirm('確定要刪除此人員嗎？')) {
    try {
      await staffCollection.doc(id).delete();
      visiblePasswordRows.delete(id);
    } catch (error) {
      console.error('刪除人員資料失敗：', error);
      alert('刪除失敗，請稍後再試。');
    }
  }
});

addButton?.addEventListener('click', openCreateModal);
cancelButton?.addEventListener('click', () => toggleModal(false));
closeButton?.addEventListener('click', () => toggleModal(false));
staffModal?.addEventListener('click', (event) => {
  if (event.target === staffModal) toggleModal(false);
});

passwordToggle?.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  passwordToggle.textContent = isHidden ? '🙈' : '👁️';
});

loadStaff();

const permissionsCollection = window.omniplayDb?.collection('permissions');
const permissionModal = document.querySelector('#permissionModal');
const permissionManager = document.querySelector('#permissionManager');
const closePermissionButton = document.querySelector('#closePermissionModal');
const cancelPermissionButton = document.querySelector('#cancelPermissionButton');
const savePermissionButton = document.querySelector('#savePermissionButton');
const pageDefinitions = [
  ['home', '首頁'], ['staff', '人員管理'], ['leave', '休假表'], ['schedule', '排程表'], ['kpi', 'KPI'],
  ['log', '日誌'], ['handover', '交接'], ['report', '提報'], ['tracking', '對接追蹤'], ['alert', 'PROD告警紀錄'],
  ['meeting', '會議紀錄'], ['knowledge', '知識庫'], ['ai_database', 'AI 資料庫']
];
let permissionCache = {};
let permissionStaffId = null;
const isProtectedOmniplay = (staff = {}) => [staff.account, staff.code, staff.name].some((value) => String(value || '').toUpperCase() === 'OMNIPLAY');

const togglePermissionModal = (isOpen) => {
  permissionModal?.classList.toggle('is-open', isOpen);
  permissionModal?.setAttribute('aria-hidden', String(!isOpen));
};

const permissionCheckbox = (staffId, page, action, checked) => `<label class="permission-check"><input type="checkbox" data-staff="${staffId}" data-page="${page}" data-action="${action}" ${checked ? 'checked' : ''}> ${action === 'view' ? '可看' : action === 'edit' ? '可編輯' : action === 'delete' ? '可刪除' : '可設計'}</label>`;

const renderPermissionManager = async (staffId = null) => {
  if (!permissionManager || !permissionsCollection) return;
  const snapshot = await permissionsCollection.get();
  permissionCache = Object.fromEntries(snapshot.docs.map((doc) => [doc.id, doc.data()]));
  const manageableStaff = staffCache.filter((staff) => !isProtectedOmniplay(staff) && (!staffId || staff.id === staffId));
  permissionManager.innerHTML = manageableStaff.map((staff) => {
    const pages = permissionCache[staff.id]?.pages || {};
    const rows = pageDefinitions.map(([key, label]) => {
      const permission = pages[key] || { view: true, edit: true, delete: true, design: true };
      return `<tr><td>${escapeHtml(label)}</td><td>${permissionCheckbox(staff.id, key, 'view', permission.view)}</td><td>${permissionCheckbox(staff.id, key, 'edit', permission.edit)}</td><td>${permissionCheckbox(staff.id, key, 'delete', permission.delete)}</td><td>${permissionCheckbox(staff.id, key, 'design', permission.design)}</td></tr>`;
    }).join('');
    return `<section class="permission-staff"><h3>${escapeHtml(staff.name)}（${escapeHtml(staff.account)}）</h3><div class="table-wrap"><table class="staff-table"><thead><tr><th>頁面</th><th>瀏覽</th><th>編輯</th><th>刪除</th><th>設計表格</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }).join('') || '<p class="empty-state">目前沒有可設定權限的人員。</p>';
};

const savePermissions = async () => {
  if (!permissionsCollection) return alert('Firebase 尚未完成初始化，無法儲存權限。');
  savePermissionButton.disabled = true;
  try {
    for (const staff of staffCache.filter((item) => !isProtectedOmniplay(item) && (!permissionStaffId || item.id === permissionStaffId))) {
      const pages = {};
      pageDefinitions.forEach(([key]) => {
        pages[key] = {};
        ['view', 'edit', 'delete', 'design'].forEach((action) => {
          pages[key][action] = Boolean(permissionManager.querySelector(`[data-staff="${staff.id}"][data-page="${key}"][data-action="${action}"]`)?.checked);
        });
      });
      await permissionsCollection.doc(staff.id).set({ staffId: staff.id, pages, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    togglePermissionModal(false);
  } catch (error) {
    console.error('儲存權限失敗：', error);
    alert('儲存權限失敗，請稍後再試。');
  } finally {
    savePermissionButton.disabled = false;
  }
};

const openPermissionManager = async (staffId) => {
if (!window.isOmniplayAdmin?.()) return;
permissionStaffId = staffId;
  await renderPermissionManager(staffId);
  togglePermissionModal(true);
};
cancelPermissionButton?.addEventListener('click', () => togglePermissionModal(false));
savePermissionButton?.addEventListener('click', savePermissions);
permissionModal?.addEventListener('click', (event) => { if (event.target === permissionModal) togglePermissionModal(false); });
