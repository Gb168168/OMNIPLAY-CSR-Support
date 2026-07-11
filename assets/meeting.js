const meetingDb = window.omniplayDb;
const meetingCollection = meetingDb?.collection('meeting');
const meetingStaffCollection = meetingDb?.collection('staff');

const meetingState = {
  records: [],
  staff: [],
  currentId: null,
  activeTab: 'techRows'
};

const detailFields = ['proposer', 'content', 'solution', 'note', 'image'];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const today = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);
const activeStaff = (staff) => (staff.status || '啟用') === '啟用';
const staffName = (staff) => staff.name || staff.code || staff.account || '未命名';
const canEditMeeting = () => window.canUse?.('edit') !== false;
const canDeleteMeeting = () => window.canUse?.('delete') === true;
const existingRecord = () => meetingState.records.find((record) => record.id === meetingState.currentId) || {};

const getNextSerial = () => {
  const max = meetingState.records.reduce((highest, record) => {
    const match = String(record.serial || record.number || '').match(/(\d+)$/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return `MTG-${String(max + 1).padStart(6, '0')}`;
};

const staffOptions = () => meetingState.staff.map((staff) => `<option value="${escapeHtml(staffName(staff))}">${escapeHtml(staffName(staff))}</option>`).join('');

const populateStaffSelects = () => {
  const options = staffOptions();
  document.querySelectorAll('[data-staff-select]').forEach((select) => {
    const values = [...select.selectedOptions].map((option) => option.value);
    select.innerHTML = select.multiple ? options : `<option value="">請選擇</option>${options}`;
    [...select.options].forEach((option) => { option.selected = values.includes(option.value); });
  });
};

const setSelectValue = (select, value) => {
  const values = Array.isArray(value) ? value : [value].filter(Boolean);
  [...select.options].forEach((option) => { option.selected = values.includes(option.value); });
};

const setFormEditable = () => {
  const editable = canEditMeeting();
  document.querySelectorAll('#meetingForm input, #meetingForm textarea, #meetingForm select').forEach((control) => {
    if (control.id !== 'meetingSerial') control.disabled = !editable;
  });
  document.querySelectorAll('[data-add-row], [data-delete-row], #saveMeetingButton').forEach((button) => {
    button.hidden = !editable;
    button.disabled = !editable;
  });
  const deleteButton = document.querySelector('#deleteMeetingButton');
  deleteButton.hidden = !meetingState.currentId || !canDeleteMeeting();
  deleteButton.disabled = !canDeleteMeeting();
  document.querySelector('#newRecordButton').hidden = !editable;
};

const renderList = () => {
  const body = document.querySelector('#meetingTableBody');
  body.innerHTML = meetingState.records.map((record) => `
    <tr data-id="${escapeHtml(record.id)}" tabindex="0">
      <td>${escapeHtml(record.date || '')}</td>
      <td>${escapeHtml(record.time || '')}</td>
      <td>${escapeHtml(record.chair || '')}</td>
      <td>${escapeHtml(record.recorder || '')}</td>
      <td>${escapeHtml(record.serial || record.number || '')}</td>
    </tr>
  `).join('');
};

const showList = () => {
  document.querySelector('#meetingFormView').hidden = true;
  document.querySelector('#meetingListView').hidden = false;
};

const showForm = (record = {}) => {
  meetingState.currentId = record.id || null;
  meetingState.activeTab = 'techRows';
  document.querySelector('#meetingListView').hidden = true;
  document.querySelector('#meetingFormView').hidden = false;
  document.querySelector('#meetingFormTitle').textContent = record.id ? '編輯會議紀錄' : '新增會議紀錄';
  document.querySelector('#meetingDate').value = record.date || today();
  document.querySelector('#meetingTime').value = record.time || currentTime();
  document.querySelector('#meetingLocation').value = record.location || '';
  document.querySelector('#meetingSerial').value = record.serial || record.number || getNextSerial();
  document.querySelector('#meetingNote').value = record.note || '';
  populateStaffSelects();
  setSelectValue(document.querySelector('#meetingChair'), record.chair || '');
  setSelectValue(document.querySelector('#meetingRecorder'), record.recorder || '');
  setSelectValue(document.querySelector('#meetingMorningAttendees'), record.morningAttendees || []);
  setSelectValue(document.querySelector('#meetingEveningAttendees'), record.eveningAttendees || []);
  renderRows('techRows', record.techRows || []);
  renderRows('csRows', record.csRows || []);
  switchTab('techRows');
  setFormEditable();
};

const renderRows = (key, rows = []) => {
  const body = document.querySelector(`[data-tab-body="${key}"]`);
  const data = rows.length ? rows : [{}];
  body.innerHTML = data.map((row, index) => rowTemplate(key, index, row)).join('');
  data.forEach((row, index) => setSelectValue(body.querySelector(`[data-row-index="${index}"] [data-field="proposer"]`), row.proposer || ''));
};

const rowTemplate = (key, index, row = {}) => `
  <tr data-row-index="${index}">
    <td><select data-staff-select data-field="proposer"><option value="">請選擇</option>${staffOptions()}</select></td>
    <td><textarea data-field="content" rows="3">${escapeHtml(row.content || '')}</textarea></td>
    <td><textarea data-field="solution" rows="3">${escapeHtml(row.solution || '')}</textarea></td>
    <td><input data-field="note" type="text" value="${escapeHtml(row.note || '')}"></td>
    <td>
      <input data-field="image" type="file" accept="image/*">
      ${row.image ? `<button class="ragic-file-preview meeting-image-preview" type="button" data-image="${escapeHtml(row.image)}"><img src="${escapeHtml(row.image)}" alt="圖片預覽"><span>檢視</span></button>` : ''}
    </td>
    <td><button class="ghost danger" data-delete-row="${key}" type="button">刪除</button></td>
  </tr>
`;

const switchTab = (key) => {
  meetingState.activeTab = key;
  document.querySelectorAll('[data-meeting-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.meetingTab === key));
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== key; });
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error('圖片讀取失敗'));
  reader.readAsDataURL(file);
});

const readRows = async (key) => {
  const previousRows = existingRecord()[key] || [];
  const rows = [];
  for (const row of document.querySelectorAll(`[data-tab-body="${key}"] tr`)) {
    const index = Number(row.dataset.rowIndex || 0);
    const item = {};
    for (const field of detailFields) {
      const control = row.querySelector(`[data-field="${field}"]`);
      if (field === 'image') item.image = control.files?.[0] ? await readFileAsDataUrl(control.files[0]) : (previousRows[index]?.image || '');
      else item[field] = control?.value?.trim() || '';
    }
    if (Object.values(item).some(Boolean)) rows.push(item);
  }
  return rows;
};

const readForm = async () => ({
  date: document.querySelector('#meetingDate').value,
  time: document.querySelector('#meetingTime').value,
  location: document.querySelector('#meetingLocation').value.trim(),
  serial: document.querySelector('#meetingSerial').value.trim() || getNextSerial(),
  chair: document.querySelector('#meetingChair').value,
  recorder: document.querySelector('#meetingRecorder').value,
  morningAttendees: [...document.querySelector('#meetingMorningAttendees').selectedOptions].map((option) => option.value),
  eveningAttendees: [...document.querySelector('#meetingEveningAttendees').selectedOptions].map((option) => option.value),
  note: document.querySelector('#meetingNote').value.trim(),
  techRows: await readRows('techRows'),
  csRows: await readRows('csRows')
});

const openImagePreview = (src) => {
  document.querySelector('#meetingPreviewImage').src = src;
  document.querySelector('#meetingImageModal').hidden = false;
};

const closeImagePreview = () => {
  document.querySelector('#meetingImageModal').hidden = true;
  document.querySelector('#meetingPreviewImage').removeAttribute('src');
};

const initMeetingPage = async () => {
  if (window.permissionReady) await window.permissionReady;
  setFormEditable();
  meetingStaffCollection?.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    meetingState.staff = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(activeStaff);
    populateStaffSelects();
  });
  meetingCollection?.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    meetingState.records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderList();
    setFormEditable();
  });
};

document.querySelector('#newRecordButton')?.addEventListener('click', () => showForm());
document.querySelector('#backToListButton')?.addEventListener('click', showList);
document.querySelector('#meetingTableBody')?.addEventListener('click', (event) => {
  const id = event.target.closest('tr')?.dataset.id;
  const record = meetingState.records.find((item) => item.id === id);
  if (record) showForm(record);
});
document.querySelector('#meetingTableBody')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const id = event.target.closest('tr')?.dataset.id;
  const record = meetingState.records.find((item) => item.id === id);
  if (record) showForm(record);
});
document.querySelector('#meetingTabs')?.addEventListener('click', (event) => {
  const key = event.target.closest('[data-meeting-tab]')?.dataset.meetingTab;
  if (key) switchTab(key);
});
document.querySelector('#meetingForm')?.addEventListener('click', (event) => {
  const addKey = event.target.closest('[data-add-row]')?.dataset.addRow;
  if (addKey && canEditMeeting()) {
    const currentRows = [...document.querySelectorAll(`[data-tab-body="${addKey}"] tr`)].map((row) => {
      const item = {};
      detailFields.forEach((field) => { if (field !== 'image') item[field] = row.querySelector(`[data-field="${field}"]`)?.value || ''; });
      return item;
    });
    renderRows(addKey, [...currentRows, {}]);
  }
  const deleteKey = event.target.closest('[data-delete-row]')?.dataset.deleteRow;
  if (deleteKey && canEditMeeting()) event.target.closest('tr')?.remove();
  const image = event.target.closest('[data-image]')?.dataset.image;
  if (image) openImagePreview(image);
});
document.querySelector('#meetingForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canEditMeeting()) return alert('您沒有編輯權限');
  if (!meetingCollection) return alert('Firebase 尚未完成初始化，無法儲存資料。');
  const saveButton = document.querySelector('#saveMeetingButton');
  const originalText = saveButton.textContent;
  saveButton.disabled = true;
  saveButton.textContent = '儲存中...';
  try {
    const data = await readForm();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    if (meetingState.currentId) await meetingCollection.doc(meetingState.currentId).set(data, { merge: true });
    else await meetingCollection.add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    showList();
  } catch (error) {
    console.error(error);
    alert(error.message || '儲存失敗，請稍後再試。');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = originalText;
  }
});
document.querySelector('#deleteMeetingButton')?.addEventListener('click', async () => {
  if (!canDeleteMeeting()) return alert('您沒有刪除權限');
  if (!meetingState.currentId || !confirm('確定刪除此筆會議紀錄？')) return;
  await meetingCollection.doc(meetingState.currentId).delete();
  showList();
});
document.querySelector('#closeMeetingImageModal')?.addEventListener('click', closeImagePreview);
document.querySelector('#meetingImageModal')?.addEventListener('click', (event) => { if (event.target.id === 'meetingImageModal') closeImagePreview(); });

initMeetingPage();
