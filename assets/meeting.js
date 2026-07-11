const meetingDb = window.omniplayDb;
const meetingCollection = meetingDb?.collection('meeting');
const meetingStaffCollection = meetingDb?.collection('staff');

const meetingState = {
  records: [],
  staff: [],
  currentId: null,
  activeTab: 'techRows',
  staffLoaded: false
};

const detailFields = ['proposer', 'content', 'solution', 'note', 'image'];
const MAX_IMAGE_WIDTH = 800;
const JPEG_QUALITY = 0.6;
const MAX_IMAGE_BYTES = 900 * 1024;

if (!window._multiSelectClickBound) {
  document.addEventListener('click', () => {
    document.querySelectorAll('.multi-select-dropdown.show').forEach((dropdown) => dropdown.classList.remove('show'));
  });
  window._multiSelectClickBound = true;
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const today = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);
const activeStaff = (staff) => staff.status === '啟用';
const visibleMeetingStaff = (staff) => activeStaff(staff) && String(staff.name || '').trim().toUpperCase() !== 'OMNIPLAY';
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
const staffDatalistOptions = () => meetingState.staff.map((staff) => `<option value="${escapeHtml(staffName(staff))}"></option>`).join('');

const populateStaffSelects = () => {
  if (!meetingState.staffLoaded) return;
  const list = document.querySelector('#meetingStaffOptions');
  if (list) list.innerHTML = staffDatalistOptions();
  
  const options = staffOptions();
  document.querySelectorAll('[data-staff-select]').forEach((select) => {
    const values = [...select.selectedOptions].map((option) => option.value);
    select.innerHTML = select.multiple ? options : `<option value="">請選擇</option>${options}`;
    [...select.options].forEach((option) => { option.selected = values.includes(option.value); });
    updateAttendeeDropdown(select);
  });
};

const updateAttendeeSummary = (select) => {
  const dropdown = select.closest('[data-attendee-dropdown]');
  if (!dropdown) return;
  const selectedValues = [...select.selectedOptions].map((option) => option.value);
  const display = dropdown.querySelector('.multi-select-display');
  if (display) {
    display.textContent = selectedValues.length ? selectedValues.join('、') : '請選擇';
    display.title = selectedValues.join('、');
  }
};

// 多選下拉元件
function createMultiSelect(container, options, fieldName) {
  const select = container.querySelector(`#${fieldName}`);
  let display = container.querySelector('.multi-select-display');
  let dropdown = container.querySelector('.multi-select-dropdown');
  if (!display || !dropdown || !select) return;

  const selectedValues = [...select.selectedOptions].map((option) => option.value);
  dropdown.innerHTML = options.map((option) => {
    const value = typeof option === 'string' ? option : option.value;
    const label = typeof option === 'string' ? option : option.label;
    const selected = selectedValues.includes(value);
    return `
      <label role="option" aria-selected="${selected}">
        <input type="checkbox" value="${escapeHtml(value)}" ${selected ? 'checked' : ''} ${select.disabled ? 'disabled' : ''}>
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }).join('');

  const displayClone = display.cloneNode(true);
  const dropdownClone = dropdown.cloneNode(true);
  display.replaceWith(displayClone);
  dropdown.replaceWith(dropdownClone);
  display = displayClone;
  dropdown = dropdownClone;
  display.textContent = selectedValues.length > 0 ? selectedValues.join('、') : '請選擇';

  // 點擊 display 區域切換下拉
  display.addEventListener('click', function(e) {
    e.stopPropagation();
    if (select.disabled) return;
    // 關閉其他已開啟的下拉
    document.querySelectorAll('.multi-select-dropdown.show').forEach(d => {
      if (d !== dropdown) d.classList.remove('show');
    });
    dropdown.classList.toggle('show');
  });

  // dropdown 本身點擊不關閉
  dropdown.addEventListener('click', function(e) {
    e.stopPropagation();
  });

  // checkbox 變化時更新顯示文字
  dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', function() {
      const option = [...select.options].find((item) => item.value === cb.value);
      if (option) option.selected = cb.checked;
      cb.closest('[role="option"]')?.setAttribute('aria-selected', String(cb.checked));
      const selected = [...dropdown.querySelectorAll('input:checked')].map(c => c.value);
      display.textContent = selected.length > 0 ? selected.join('、') : '請選擇';
      display.title = selected.join('、');
    });
  });
}

const updateAttendeeDropdown = (select) => {
  const container = select.closest('[data-attendee-dropdown]');
  if (!container) return;
  const options = [...select.options].map((option) => ({ value: option.value, label: option.textContent }));
  setTimeout(() => createMultiSelect(container, options, select.id), 0);
};

const updateAttendeeDropdowns = () => {
  document.querySelectorAll('[data-attendee-dropdown] select[multiple]').forEach(updateAttendeeDropdown);
};

const setSelectValue = (control, value) => {
  if (!control) return;
  if (control.matches?.('input')) {
    control.value = Array.isArray(value) ? (value[0] || '') : (value || '');
    return;
  }
  const values = Array.isArray(value) ? value : [value].filter(Boolean);
  [...control.options].forEach((option) => { option.selected = values.includes(option.value); });
  updateAttendeeDropdown(control);
};

const setFormEditable = () => {
  const editable = canEditMeeting();
  document.querySelectorAll('#meetingForm input, #meetingForm textarea, #meetingForm select').forEach((control) => {
    if (control.id !== 'meetingSerial') control.disabled = !editable;
  });
  document.querySelectorAll('[data-attendee-toggle]').forEach((button) => { button.disabled = !editable; });
  updateAttendeeDropdowns();
  document.querySelectorAll('[data-add-row], [data-delete-row], #saveMeetingButton').forEach((button) => {
    button.hidden = !editable;
    button.disabled = !editable;
  });
  const deleteButton = document.querySelector('#deleteMeetingButton');
  if (deleteButton) {
    deleteButton.hidden = !meetingState.currentId || !canDeleteMeeting();
    deleteButton.disabled = !canDeleteMeeting();
  }
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
    <td><textarea data-field="note" rows="2">${escapeHtml(row.note || '')}</textarea></td>
    <td>
      <div class="image-upload-area" tabindex="0">
        <div>選擇檔案 或 Ctrl+V 貼上圖片</div>
        <input data-field="image" type="file" accept="image/*" ${row.image ? `data-image-value="${escapeHtml(row.image)}"` : ''}>
        ${row.image ? `<span class="ragic-file-preview meeting-image-preview image-upload-preview" data-image="${escapeHtml(row.image)}"><img src="${escapeHtml(row.image)}" alt="圖片預覽"><span>檢視</span><button class="image-preview-remove" type="button" aria-label="移除圖片">×</button></span>` : ''}
      </div>
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

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('圖片載入失敗，請選擇有效的圖片檔案'));
  image.src = src;
});

const canvasToJpegDataUrl = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) { reject(new Error('圖片壓縮失敗')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result, size: blob.size });
    reader.onerror = () => reject(reader.error || new Error('圖片壓縮失敗'));
    reader.readAsDataURL(blob);
  }, 'image/jpeg', JPEG_QUALITY);
});

const compressImageToBase64 = async (file) => {
  if (!file) return '';
  if (!file.type?.startsWith('image/')) throw new Error('請選擇圖片檔案');
  const loadedImage = await loadImage(await readFileAsDataUrl(file));
  const scale = loadedImage.width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / loadedImage.width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(loadedImage.width * scale);
  canvas.height = Math.round(loadedImage.height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
  const { dataUrl, size } = await canvasToJpegDataUrl(canvas);
  if (size > MAX_IMAGE_BYTES) throw new Error('圖片壓縮後仍超過 900KB，請選擇較小的圖片');
  return dataUrl;
};

const showImagePreview = (base64, container) => {
  if (!container || !base64) return;
  const input = container.querySelector('[data-field="image"]');
  if (input) input.dataset.imageValue = base64;
  container.querySelector('.ragic-file-preview')?.remove();
  const preview = document.createElement('span');
  preview.className = 'ragic-file-preview meeting-image-preview image-upload-preview';
  preview.dataset.image = base64;
  preview.innerHTML = `<img src="${escapeHtml(base64)}" alt="圖片預覽"><span>檢視</span><button class="image-preview-remove" type="button" aria-label="移除圖片">×</button>`;
  container.appendChild(preview);
};

const processImageFile = async (file, container) => {
  const base64 = await compressImageToBase64(file);
  showImagePreview(base64, container);
};

const handleImagePaste = async (event, imageArea) => {
  const items = event.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault();
      const file = item.getAsFile();
      await processImageFile(file, imageArea);
      break;
    }
  }
};

const readRows = async (key) => {
  const previousRows = existingRecord()[key] || [];
  const rows = [];
  for (const row of document.querySelectorAll(`[data-tab-body="${key}"] tr`)) {
    const index = Number(row.dataset.rowIndex || 0);
    const item = {};
    for (const field of detailFields) {
      const control = row.querySelector(`[data-field="${field}"]`);
      if (field === 'image') item.image = control.files?.[0] ? await compressImageToBase64(control.files[0]) : (control?.dataset.imageValue || previousRows[index]?.image || '');
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
  meetingStaffCollection?.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    meetingState.staff = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(visibleMeetingStaff);
    meetingState.staffLoaded = true;
    populateStaffSelects();
    setFormEditable();
  }, (error) => {
    console.error('讀取會議人員資料失敗：', error);
    meetingState.staff = [];
    meetingState.staffLoaded = true;
    populateStaffSelects();
    setFormEditable();
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
  const clearId = event.target.closest('[data-clear-combo]')?.dataset.clearCombo;
  if (!clearId) return;
  const input = document.querySelector(`#${clearId}`);
  if (input && !input.disabled) {
    input.value = '';
    input.focus();
  }
});
document.querySelector('#meetingForm')?.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-field="image"]');
  if (!input?.files?.[0]) return;
  try { await processImageFile(input.files[0], input.closest('.image-upload-area')); }
  catch (error) { alert(error.message || '圖片處理失敗，請稍後再試。'); input.value = ''; }
});

document.querySelector('#meetingForm')?.addEventListener('paste', (event) => {
  const imageArea = event.target.closest('.image-upload-area');
  if (!imageArea) return;
  handleImagePaste(event, imageArea).catch((error) => alert(error.message || '圖片處理失敗，請稍後再試。'));
});

document.querySelector('#meetingForm')?.addEventListener('click', async (event) => {
  const removeButton = event.target.closest('.image-preview-remove');
  if (removeButton) {
    event.preventDefault();
    event.stopPropagation();
    const imageArea = removeButton.closest('.image-upload-area');
    const input = imageArea?.querySelector('[data-field="image"]');
    if (input) {
      input.value = '';
      delete input.dataset.imageValue;
    }
    removeButton.closest('.ragic-file-preview')?.remove();
    return;
  }
  const addKey = event.target.closest('[data-add-row]')?.dataset.addRow;
  if (addKey && canEditMeeting()) {
    try {
      const currentRows = await Promise.all([...document.querySelectorAll(`[data-tab-body="${addKey}"] tr`)].map(async (row) => {
        const item = {};
        for (const field of detailFields) {
          if (field === 'image') {
            const control = row.querySelector('[data-field="image"]');
            item.image = control?.files?.[0] ? await compressImageToBase64(control.files[0]) : (control?.dataset.imageValue || '');
          } else {
            item[field] = row.querySelector(`[data-field="${field}"]`)?.value || '';
          }
        }
        return item;
      }));
      renderRows(addKey, [...currentRows, {}]);
    } catch (error) {
      alert(error.message || '圖片處理失敗，請稍後再試。');
    }
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
  if (!meetingCollection) return;
  if (!meetingState.currentId || !confirm('確定刪除此筆會議紀錄？')) return;
  try {
    await meetingCollection.doc(meetingState.currentId).delete();
    showList();
  } catch (e) {
    alert('刪除失敗：' + e.message);
  }
});
document.querySelector('#closeMeetingImageModal')?.addEventListener('click', closeImagePreview);
document.querySelector('#meetingImageModal')?.addEventListener('click', (event) => { if (event.target.id === 'meetingImageModal') closeImagePreview(); });

initMeetingPage();
