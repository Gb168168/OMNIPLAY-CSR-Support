const meetingDb = window.omniplayDb;
const meetingStorage = window.omniplayStorage;
const meetingCollection = meetingDb?.collection('meeting');
const meetingStaffCollection = meetingDb?.collection('staff');
const meetingSettingsDoc = meetingDb?.collection('meetingSettings').doc('staffList');
const meetingDesignDoc = meetingDb?.collection('meetingSettings').doc('tableDesign');

const meetingState = {
  records: [],
  staff: [],
  defaultStaff: [],
  files: [],
  removedBackendFiles: [],
  tabs: [],
  currentId: null,
  activeTab: 'techRows',
  staffLoaded: false
};

const FALLBACK_MEETING_TABS = ['技術會議', '客服會議'];
let DEFAULT_MEETING_TABS = [...FALLBACK_MEETING_TABS];
const MEETING_LOCATIONS = ['2F', '3F'];
const detailFields = ['proposer', 'content', 'solution', 'note', 'image'];
const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
// 2026-10-07 Firebase 移除 batch5:會議附件改存後端(/api/files/*)。
// 上限以後端 GET /api/files/config 為準(env CSR_FILES_MAX_BYTES);拿不到時先用 1GB 擋。
let MAX_MEETING_FILE_BYTES = 1024 * 1024 * 1024;
const MEETING_UPLOAD_STALL_MS = 30 * 1000;
const meetingApiBase = () => String(window.CSR_API_BASE || '').replace(/\/+$/, '');
const meetingAuthHeaders = () => {
  const token = sessionStorage.getItem('csr_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
};
// GitHub Pages 版沒有後端(meetingApiBase() 為空):不能上傳,停用上傳 UI 並說明;既有附件照常讀
const MEETING_UPLOAD_UNSUPPORTED_TEXT = '此版本不支援上傳附件，請用公司內網的客服系統';
const meetingUploadSupported = () => Boolean(meetingApiBase());
const applyMeetingUploadAvailability = () => {
  if (meetingUploadSupported()) return;
  const input = document.querySelector('#meetingFileInput');
  if (input) {
    input.disabled = true;
    input.hidden = true;
  }
  const zone = document.querySelector('#meetingFileDropZone');
  const hint = zone?.firstElementChild;
  if (hint && hint !== input) hint.textContent = MEETING_UPLOAD_UNSUPPORTED_TEXT;
  zone?.classList.add('is-upload-disabled');
};
let meetingFileConfigLoaded = false;
const loadMeetingFileConfig = async () => {
  if (meetingFileConfigLoaded || !meetingApiBase()) return;
  try {
    const response = await fetch(`${meetingApiBase()}/api/files/config`, { headers: meetingAuthHeaders() });
    if (!response.ok) return;
    const config = await response.json();
    if (Number(config.maxBytes) > 0) MAX_MEETING_FILE_BYTES = Number(config.maxBytes);
    meetingFileConfigLoaded = true;
  } catch (error) {
    console.warn('讀取附件上限失敗,先用預設 1GB:', error);
  }
};

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
const canDesignMeeting = () => window.canUse?.('design') === true;
const existingRecord = () => meetingState.records.find((record) => record.id === meetingState.currentId) || {};

const getNextSerial = () => {
  const max = meetingState.records.reduce((highest, record) => {
    const match = String(record.serial || record.number || '').match(/(\d+)$/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return `MTG-${String(max + 1).padStart(6, '0')}`;
};

// One month of Wednesday 19:30 meetings, keyed by their originally planned date.
const weeklyMeetingDates = (year, monthIndex) => {
  const dates = [];
  const days = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= days; day += 1) {
    if (new Date(year, monthIndex, day).getDay() !== 3) continue;
    dates.push(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return dates;
};
const nextWeeklyDate = (date) => {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString().slice(0, 10);
};
const isWeeklyMeeting = (record) => record.time === '19:30'
  && /^\d{4}-\d{2}-\d{2}$/.test(record.date || '')
  && new Date(`${record.date}T12:00:00Z`).getUTCDay() === 3;
let generatingMeetingMonth = false;
const generatedMeetingMonths = new Set();
const ensureCurrentMonthMeetings = async () => {
  if (generatingMeetingMonth || !canEditMeeting() || !meetingCollection) return;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (generatedMeetingMonths.has(monthKey)) return;
  generatingMeetingMonth = true;
  try {
    const known = new Set(meetingState.records.filter(isWeeklyMeeting).map((record) => record.date));
    meetingState.records.forEach((record) => {
      if (record.weeklyScheduledFor) known.add(record.weeklyScheduledFor);
    });
    let nextSerialNumber = Number(getNextSerial().match(/\d+$/)?.[0] || 1);
    for (const date of weeklyMeetingDates(now.getFullYear(), now.getMonth())) {
      if (known.has(date)) continue;
      const recordRef = meetingCollection.doc(`weekly-${date}`);
      if ((await recordRef.get()).exists) continue;
      await recordRef.set({
        date, time: '19:30', status: 'auto',
        serial: `MTG-${String(nextSerialNumber++).padStart(6, '0')}`,
        weeklyScheduledFor: date,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      known.add(date);
    }
    generatedMeetingMonths.add(monthKey);
  } catch (error) {
    console.error('產生當月週三例會失敗：', error);
  } finally {
    generatingMeetingMonth = false;
  }
};

// Move later Wednesday meetings from the end backward so their content stays with each record.
const planWeeklyPostponement = (date, currentId) => {
  const later = meetingState.records.filter((record) => record.id !== currentId
    && isWeeklyMeeting(record) && record.date > date
    && !['cancelled', 'completed', 'postponed'].includes(record.status));
  const movingIds = new Set(later.map((record) => record.id));
  const targetDates = new Set([nextWeeklyDate(date), ...later.map((record) => nextWeeklyDate(record.date))]);
  if (targetDates.size !== later.length + 1
    || meetingState.records.some((record) => record.id !== currentId && !movingIds.has(record.id)
      && record.time === '19:30' && targetDates.has(record.date))) {
    throw new Error('後續週三 19:30 已有其他會議，請先調整衝突的日期，再設定延期。');
  }
  return later.sort((a, b) => b.date.localeCompare(a.date));
};

const staffNames = () => meetingState.staff.map((staff) => typeof staff === 'string' ? staff : staffName(staff)).filter(Boolean);
const staffOptions = () => staffNames().map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
const staffDatalistOptions = () => staffNames().map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
const makeTabKey = (name, index) => `tab-${index}-${String(name).replace(/[^\w\u4e00-\u9fa5-]/g, '-')}`;
const normalizeTabs = (record = {}) => {
  if (Array.isArray(record.tabs) && record.tabs.length) return record.tabs.map((tab) => ({ name: tab.name, rows: tab.rows || [] }));
  return DEFAULT_MEETING_TABS.map((name, index) => ({ name, rows: index === 0 ? (record.techRows || []) : (record.csRows || []) }));
};
const populateLocationSelect = () => {
  const select = document.querySelector('#meetingLocation');
  if (!select) return;
  const value = select.value;
  select.innerHTML = MEETING_LOCATIONS.map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join('');
  if (MEETING_LOCATIONS.includes(value)) select.value = value;
};

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
  applyMeetingUploadAvailability(); // 上面的迴圈會把附件 input 重新打開,沒有後端時要再關掉
  updateAttendeeDropdowns();
  document.querySelectorAll('[data-delete-row], #saveMeetingButton, #addMeetingTabButton, [data-delete-tab], #staffSettingsButton').forEach((button) => {
    button.hidden = !editable;
    button.disabled = !editable;
  });
  const designButton = document.querySelector('#designMeetingTableButton');
  if (designButton) {
    designButton.hidden = !canDesignMeeting();
    designButton.disabled = !canDesignMeeting();
  }
  const deleteButton = document.querySelector('#deleteMeetingButton');
  if (deleteButton) {
    deleteButton.hidden = !meetingState.currentId || !canDeleteMeeting();
    deleteButton.disabled = !canDeleteMeeting();
  }
  document.querySelector('#newRecordButton').hidden = !editable;
};

const meetingStatusInfo = (record = {}) => {
  const manualStatus = String(record.status || '');
  const manual = {
    completed: { key: 'completed', label: '已完成', icon: '' },
    postponed: { key: 'postponed', label: '延期', icon: '⏸️' },
    cancelled: { key: 'cancelled', label: '取消', icon: '' }
  };
  if (manual[manualStatus]) return manual[manualStatus];
  const dateText = String(record.date || '');
  const timeText = String(record.time || '00:00');
  const meetingAt = new Date(`${dateText}T${timeText || '00:00'}`);
  if (!dateText || Number.isNaN(meetingAt.getTime())) return { key: 'scheduled', label: '待召開', icon: '' };
  const now = new Date();
  if (!manualStatus && meetingAt < new Date(now.getFullYear(), now.getMonth(), now.getDate())) return manual.completed;
  const minutesUntil = (meetingAt.getTime() - now.getTime()) / 60000;
  if (minutesUntil > 30) return { key: 'scheduled', label: '待召開', icon: '' };
  if (minutesUntil > 0) return { key: 'soon', label: '即將開始', icon: '' };
  return { key: 'active', label: '進行中', icon: '' };
};

const renderList = () => {
  const body = document.querySelector('#meetingTableBody');
  // Sort on every render so new records and date changes keep their meeting-date position.
  const records = [...meetingState.records].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
    || String(b.time || '').localeCompare(String(a.time || '')));
  body.innerHTML = records.map((record) => {
    const status = meetingStatusInfo(record);
    return `
    <tr class="meeting-status-row meeting-status-${status.key}" data-id="${escapeHtml(record.id)}" tabindex="0">
      <td><span class="meeting-status-badge meeting-status-badge-${status.key}">${status.icon} ${status.label}</span></td>
      <td>${escapeHtml(record.date || '')}</td>
      <td>${escapeHtml(record.time || '')}</td>
      <td>${escapeHtml(record.chair || '')}</td>
      <td>${escapeHtml(record.recorder || '')}</td>
      <td>${escapeHtml(record.serial || record.number || '')}</td>
    </tr>
  `;
  }).join('');
};

const updateMeetingUrl = (id = '') => {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('id', id);
  else url.searchParams.delete('id');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const showList = () => {
  document.querySelector('#meetingFormView').hidden = true;
  document.querySelector('#meetingListView').hidden = false;
  meetingState.currentId = null;
  updateMeetingUrl();
};


const renderTabs = (tabs = meetingState.tabs) => {
  meetingState.tabs = tabs.length ? tabs : DEFAULT_MEETING_TABS.map((name) => ({ name, rows: [] }));
  const tabsEl = document.querySelector('#meetingTabs');
  const panelsEl = document.querySelector('#meetingTabPanels');
  if (!tabsEl || !panelsEl) return;
  tabsEl.innerHTML = meetingState.tabs.map((tab, index) => {
    const key = makeTabKey(tab.name, index);
    const removable = !DEFAULT_MEETING_TABS.includes(tab.name);
    return `<button class="meeting-tab${key === meetingState.activeTab ? ' is-active' : ''}" type="button" data-meeting-tab="${escapeHtml(key)}" role="tab"><span>${escapeHtml(tab.name)}</span>${removable ? `<span class="meeting-tab-delete" data-delete-tab="${escapeHtml(key)}" title="刪除 ${escapeHtml(tab.name)}">×</span>` : ''}</button>`;
  }).join('') + '<button class="meeting-tab meeting-tab-add" type="button" id="addMeetingTabButton">＋</button>';
  panelsEl.innerHTML = meetingState.tabs.map((tab, index) => {
    const key = makeTabKey(tab.name, index);
    return `<div class="meeting-tab-panel" data-tab-panel="${escapeHtml(key)}" ${key === meetingState.activeTab ? '' : 'hidden'}><div class="ragic-table-wrap"><table class="meeting-detail-table"><thead><tr><th>提出者</th><th>內容</th><th>解決</th><th>備註</th><th>圖片</th><th>操作</th></tr></thead><tbody data-tab-body="${escapeHtml(key)}"></tbody></table></div></div>`;
  }).join('');
  meetingState.tabs.forEach((tab, index) => renderRows(makeTabKey(tab.name, index), tab.rows || []));
  // 分頁內容每次重建後，同步刷新新增、刪除等操作按鈕的顯示狀態。
  setFormEditable();
};

const currentRowsByKey = async (key) => readRows(key);

const meetingFileUrl = (file) => file?.url || file?.downloadURL || file?.downloadUrl || file?.dataUrl || file?.objectUrl || file?.src || file?.data || '';
const meetingFileStoragePath = (file) => file?.path || file?.storagePath || file?.fullPath || '';
// 過渡期兩種附件並存:
//   舊的 Firebase Storage 檔 → {name,type,size,path:'meeting-files/...',url:'https://firebasestorage...'}(url 照用)
//   新的後端檔             → {name,type,size,path:'srv:meeting/<id>/<fileId>',storage:'backend',fileId,sha256}
//                            url 不寫進文件(簽章網址會過期),每次開表單時向後端換一個
const isBackendMeetingFile = (file) => file?.storage === 'backend' || String(file?.path || '').startsWith('srv:');
const persistableMeetingFile = (file) => {
  const { file: _raw, objectUrl, pending, uploadStatus, linkError, linkErrorText, linkExpiresAt, ...rest } = file || {};
  if (isBackendMeetingFile(rest)) delete rest.url;
  return rest;
};
const requestBackendFileLinks = async (paths, download = false) => {
  if (!meetingApiBase()) throw new Error('此版本無法開啟後端附件，請用公司內網的客服系統');
  const response = await fetch(`${meetingApiBase()}/api/files/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...meetingAuthHeaders() },
    body: JSON.stringify({ paths, download })
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('登入已過期，請重新登入');
    if (response.status === 404) throw new Error('檔案已被刪除或不存在');
    throw new Error(failure.error || `取得檔案連結失敗（${response.status}）`);
  }
  const body = await response.json();
  const links = {};
  Object.entries(body.links || {}).forEach(([path, url]) => { links[path] = meetingApiBase() + url; });
  return { links, expires: Number(body.expires) || 0 };
};
const freshBackendFileLink = async (file, download = false) => {
  if (!download && file.url && Date.now() / 1000 < Number(file.linkExpiresAt || 0) - 60) return file.url;
  const { links, expires } = await requestBackendFileLinks([file.path], download);
  const url = links[file.path];
  if (!url) throw new Error('檔案已被刪除或不存在');
  if (!download) {
    file.url = url;
    file.linkExpiresAt = expires;
  }
  return url;
};
const meetingFileType = (file) => {
  const savedType = String(file?.type || file?.contentType || '').trim();
  if (savedType) return savedType;
  const name = String(file?.name || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image/*';
  if (/\.(mov|mp4|m4v|webm|avi)$/.test(name)) return 'video/*';
  if (/\.pdf$/.test(name)) return 'application/pdf';
  return 'application/octet-stream';
};
const isPreviewableMeetingFile = (file) => meetingFileType(file).startsWith('video/') || meetingFileType(file).startsWith('image/') || meetingFileType(file).includes('pdf');
const formatMeetingBytes = (bytes = 0) => {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(2)} GB`;
};

const renderMeetingFiles = () => {
  const list = document.querySelector('#meetingFileList');
  if (!list) return;
  list.innerHTML = meetingState.files.map((file, index) => {
    const href = meetingFileUrl(file);
    const isPending = file.pending || file.file;
    const previewButton = href && isPreviewableMeetingFile(file) ? `<button class="secondary meeting-file-action" type="button" data-preview-file="${index}">預覽</button>` : '';
    const downloadButton = href ? `<button class="secondary meeting-file-action" type="button" data-download-file="${index}">下載</button>` : '';
    const unavailableText = file.linkErrorText || (file.linkError || !meetingFileStoragePath(file) ? '無法取得檔案連結' : '連結載入中…');
    const unavailable = !href && !isPending ? `<span class="meeting-file-status">${unavailableText}</span>` : '';
    return `<div class="meeting-file-item"><span class="meeting-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>${previewButton}${downloadButton}${isPending ? `<span class="meeting-file-status">${escapeHtml(file.uploadStatus || '待儲存上傳')}</span>` : unavailable}<button class="ghost danger" type="button" data-remove-file="${index}" aria-label="移除 ${escapeHtml(file.name)}">×</button></div>`;
  }).join('');
};

const hydrateMeetingFileUrls = async () => {
  const backendFiles = meetingState.files.filter((file) => isBackendMeetingFile(file) && !file.url && !file.pending && !file.file);
  const unresolvedFiles = meetingState.files.filter((file) => !isBackendMeetingFile(file) && !meetingFileUrl(file) && meetingFileStoragePath(file));
  if (!backendFiles.length && !unresolvedFiles.length) return;
  if (backendFiles.length) {
    try {
      const { links, expires } = await requestBackendFileLinks(backendFiles.map((file) => file.path));
      backendFiles.forEach((file) => {
        if (links[file.path]) {
          file.url = links[file.path];
          file.linkExpiresAt = expires;
        } else {
          file.linkError = true;
          file.linkErrorText = '檔案已被刪除或不存在';
        }
      });
    } catch (error) {
      console.warn('會議附件連結載入失敗：', error);
      backendFiles.forEach((file) => {
        file.linkError = true;
        file.linkErrorText = error.message || '無法取得檔案連結';
      });
    }
  }
  // 舊的 Firebase 檔:只有 path 沒有 url 的,要 Firebase Storage SDK 才換得到網址(SDK 已移除 → 標成無法取得,待搬遷)
  if (!meetingStorage) unresolvedFiles.forEach((file) => { file.linkError = true; });
  await Promise.all((meetingStorage ? unresolvedFiles : []).map(async (file) => {
    try {
      file.url = await meetingStorage.ref(meetingFileStoragePath(file)).getDownloadURL();
    } catch (error) {
      console.warn('會議附件連結載入失敗：', meetingFileStoragePath(file), error);
      file.linkError = true;
    }
  }));
  renderMeetingFiles();
};


const openMeetingFilePreview = (file) => {
  const modal = document.querySelector('#meetingFilePreviewModal');
  const title = document.querySelector('#meetingFilePreviewTitle');
  const body = document.querySelector('#meetingFilePreviewBody');
  const url = meetingFileUrl(file);
  if (!modal || !title || !body || !url) return;
  const type = meetingFileType(file);
  title.textContent = file.name || '檔案預覽';
  if (type.startsWith('video/')) {
    body.innerHTML = `<video class="meeting-file-preview-media" src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>`;
  } else if (type.startsWith('image/')) {
    body.innerHTML = `<img class="meeting-file-preview-media" src="${escapeHtml(url)}" alt="${escapeHtml(file.name || '檔案預覽')}">`;
  } else if (type.includes('pdf')) {
    body.innerHTML = `<iframe class="meeting-file-preview-frame" src="${escapeHtml(url)}" title="${escapeHtml(file.name || 'PDF 預覽')}"></iframe>`
      + '<p class="meeting-file-status">PDF 沒有顯示？請改用 <button class="secondary meeting-file-action" type="button" data-preview-download>下載</button></p>';
    body.querySelector('[data-preview-download]')?.addEventListener('click', () => {
      downloadMeetingFile(file).catch((error) => alert(`檔案下載失敗：${error.message || '請稍後再試。'}`));
    });
  } else {
    body.innerHTML = '<p class="meeting-file-status">此檔案類型不支援內嵌預覽，請下載後查看。</p>';
  }
  modal.hidden = false;
};

const closeMeetingFilePreview = () => {
  const modal = document.querySelector('#meetingFilePreviewModal');
  const body = document.querySelector('#meetingFilePreviewBody');
  if (body) body.innerHTML = '';
  if (modal) modal.hidden = true;
};

const clickDownloadLink = (url, filename) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'meeting-file';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const downloadMeetingFile = async (file) => {
  if (isBackendMeetingFile(file) && !file.pending && !file.file) {
    // 後端檔:拿 attachment 版的簽章網址直接交給瀏覽器下載(不 fetch 成 blob,1GB 檔不會吃爆記憶體)
    clickDownloadLink(await freshBackendFileLink(file, true), file.name);
    return;
  }
  const url = meetingFileUrl(file);
  if (!url) return;
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    clickDownloadLink(url, file.name);
    return;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('download failed');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    clickDownloadLink(objectUrl, file.name);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    window.open(url, '_blank', 'noopener');
  }
};

const addMeetingFiles = async (files) => {
  if (!meetingUploadSupported()) {
    applyMeetingUploadAvailability();
    return;
  }
  await loadMeetingFileConfig();
  for (const file of files) {
    if (file.size > MAX_MEETING_FILE_BYTES) throw new Error(`${file.name} 超過 ${formatMeetingBytes(MAX_MEETING_FILE_BYTES)}，請選擇較小的檔案`);
    meetingState.files.push({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      objectUrl: URL.createObjectURL(file),
      pending: true,
      file
    });
  }
  renderMeetingFiles();
};

// 單檔上傳到後端:PUT 原始位元組(XHR 才拿得到上傳進度);檔名放 query(不用自訂 header,免 CORS preflight 問題)
const uploadMeetingFileToBackend = (recordKey, fileItem, onBytes) => new Promise((resolve, reject) => {
  const file = fileItem.file;
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', `${meetingApiBase()}/api/files/meeting/${encodeURIComponent(recordKey)}?name=${encodeURIComponent(file.name)}&dedupe=1`);
  Object.entries(meetingAuthHeaders()).forEach(([key, value]) => xhr.setRequestHeader(key, value));
  xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
  let lastProgressAt = Date.now();
  const stallTimer = setInterval(() => {
    if (Date.now() - lastProgressAt < MEETING_UPLOAD_STALL_MS) return;
    clearInterval(stallTimer);
    xhr.abort();
    reject(new Error(`「${file.name}」30 秒沒有傳輸資料，請檢查網路連線後再試。`));
  }, 1000);
  xhr.upload.onprogress = (event) => {
    lastProgressAt = Date.now();
    onBytes(event.loaded, event.lengthComputable ? event.total : file.size);
  };
  xhr.upload.onload = () => {
    // 位元組送完了,剩伺服器寫檔(前面若有反向代理先收完整檔再轉送,可能要等一陣子)→ 不再用 30 秒卡死判斷
    clearInterval(stallTimer);
    fileItem.uploadStatus = '伺服器寫入中…';
    renderMeetingFiles();
  };
  xhr.onload = () => {
    clearInterval(stallTimer);
    let body = {};
    try { body = JSON.parse(xhr.responseText || '{}'); } catch (error) { body = {}; }
    if (xhr.status === 200 || xhr.status === 201) return resolve(body);
    if (xhr.status === 401) return reject(new Error('登入已過期，請重新登入後再上傳。'));
    if (xhr.status === 413) return reject(new Error(`「${file.name}」超過伺服器上限 ${formatMeetingBytes(MAX_MEETING_FILE_BYTES)}。`));
    return reject(new Error(body.error || `「${file.name}」上傳失敗（HTTP ${xhr.status}）`));
  };
  xhr.onerror = () => {
    clearInterval(stallTimer);
    reject(new Error(`「${file.name}」上傳連線中斷，請檢查網路後再試。`));
  };
  xhr.onabort = () => clearInterval(stallTimer);
  xhr.send(file);
});

const uploadMeetingFiles = async (onProgress = () => {}) => {
  const pendingFiles = meetingState.files.filter((file) => file.file || file.pending);
  if (!pendingFiles.length) return meetingState.files;
  if (!meetingUploadSupported()) return meetingState.files.filter((file) => !file.file && !file.pending);
  const serial = document.querySelector('#meetingSerial')?.value?.trim() || getNextSerial();
  const recordKey = meetingState.currentId || serial || `new-${Date.now()}`;
  const uploadedFiles = [];
  const totalBytes = pendingFiles.reduce((sum, item) => sum + Number(item.file?.size || item.size || 0), 0);
  let completedBytes = 0;
  for (const fileItem of meetingState.files) {
    if (!fileItem.file && !fileItem.pending) {
      uploadedFiles.push(fileItem);
      continue;
    }
    const file = fileItem.file;
    const startedAt = Date.now();
    let lastRenderedAt = 0;
    fileItem.uploadStatus = '正在建立上傳連線…';
    renderMeetingFiles();
    const result = await uploadMeetingFileToBackend(recordKey, fileItem, (loaded, total) => {
      const transferred = completedBytes + loaded;
      const percent = totalBytes ? Math.min(100, (transferred / totalBytes) * 100) : 100;
      const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
      const bytesPerSecond = loaded / elapsedSeconds;
      fileItem.uploadStatus = loaded
        ? `${formatMeetingBytes(loaded)} / ${formatMeetingBytes(total)} · ${formatMeetingBytes(bytesPerSecond)}/s`
        : '正在建立上傳連線…';
      if (Date.now() - lastRenderedAt >= 500) {
        lastRenderedAt = Date.now();
        renderMeetingFiles();
      }
      onProgress({ percent, fileName: file.name, transferred, totalBytes, bytesPerSecond });
    });
    completedBytes += file.size;
    uploadedFiles.push({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: Number(result.size) || file.size,
      path: result.path,
      storage: 'backend',
      fileId: result.id,
      sha256: result.sha256
    });
  }
  meetingState.files.forEach((fileItem) => {
    if (fileItem.objectUrl) URL.revokeObjectURL(fileItem.objectUrl);
  });
  meetingState.files = uploadedFiles;
  renderMeetingFiles();
  hydrateMeetingFileUrls();
  return uploadedFiles;
};

// 儲存成功後才把使用者按 × 移掉的後端檔丟進後端 trash(軟刪除,可救回);失敗不擋存檔
// 按 × 移除:畫面上先拿掉;後端檔記進待刪清單,等會議存檔成功後才決定要不要真的送 DELETE
const removeMeetingFileAt = (index) => {
  const [removedFile] = meetingState.files.splice(index, 1);
  if (removedFile?.objectUrl) URL.revokeObjectURL(removedFile.objectUrl);
  if (isBackendMeetingFile(removedFile) && !removedFile.pending && !removedFile.file) meetingState.removedBackendFiles.push(removedFile);
  renderMeetingFiles();
};

// 會議存檔失敗時不會走到這裡 → removedBackendFiles 原封不動留到下次存檔;DELETE 本身失敗的也放回去下次再送
// ⛔ 只刪「存檔後的 meetingState.files 已經沒有任何一筆引用」的 path:
//    上傳有 dedupe=1,移除 X 後又加回同一個檔會拿回 X 的原路徑;同一個檔附兩次也共用路徑 —— 這些都不可刪。
const trashRemovedBackendFiles = async () => {
  if (!meetingUploadSupported()) return;
  const stillReferenced = new Set(meetingState.files.map((file) => String(file?.path || '')).filter(Boolean));
  const seen = new Set();
  const removed = meetingState.removedBackendFiles.splice(0).filter((file) => {
    const path = String(file?.path || '');
    if (!path || stillReferenced.has(path) || seen.has(path)) return false;
    seen.add(path);
    return true;
  });
  const retry = [];
  await Promise.all(removed.map(async (file) => {
    const [, meetingId, fileId] = String(file.path).match(/^srv:meeting\/([^/]+)\/([0-9a-f]{32})$/) || [];
    if (!meetingId) return;
    try {
      const response = await fetch(`${meetingApiBase()}/api/files/meeting/${encodeURIComponent(meetingId)}/${fileId}`, {
        method: 'DELETE',
        headers: meetingAuthHeaders()
      });
      // 404 = 已經不在了;409 = 後端查到會議還在用(第二道防線擋下)→ 都算處理完,不重送
      if (!response.ok && response.status !== 404 && response.status !== 409) retry.push(file);
    } catch (error) {
      console.warn('移除附件失敗(檔案仍在後端,下次存檔再試)：', file.path, error);
      retry.push(file);
    }
  }));
  meetingState.removedBackendFiles.push(...retry);
};

const renderStaffSettings = () => {
  const list = document.querySelector('#staffSettingsList');
  if (!list) return;
  list.innerHTML = staffNames().map((name) => `<div class="staff-settings-item"><span>${escapeHtml(name)}</span><button class="ghost danger" type="button" data-remove-staff="${escapeHtml(name)}">×</button></div>`).join('');
};

const saveStaffSettings = async () => {
  await meetingSettingsDoc?.set({ names: staffNames(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
};

const renderMeetingTableDesign = () => {
  const input = document.querySelector('#meetingDefaultTabsInput');
  if (input) input.value = DEFAULT_MEETING_TABS.join('\n');
};

const saveMeetingTableDesign = async () => {
  if (!canDesignMeeting()) return alert('您沒有設計權限');
  const tabs = String(document.querySelector('#meetingDefaultTabsInput')?.value || '')
    .split(/\n+/)
    .map((name) => name.trim())
    .filter(Boolean);
  DEFAULT_MEETING_TABS = tabs.length ? tabs : [...FALLBACK_MEETING_TABS];
  await meetingDesignDoc?.set({ defaultTabs: DEFAULT_MEETING_TABS, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  renderMeetingTableDesign();
  document.querySelector('#meetingTableDesignModal').hidden = true;
  alert('會議紀錄表格設計已儲存');
};

const syncPostponedRequiredFields = () => {
  const postponed = document.querySelector('#meetingStatus')?.value === 'postponed';
  for (const id of ['meetingChair', 'meetingRecorder']) {
    const control = document.querySelector(`#${id}`);
    if (control) control.required = !postponed;
  }
};

const showForm = (record = {}) => {
  meetingState.currentId = record.id || null;
  updateMeetingUrl(meetingState.currentId || '');
  meetingState.activeTab = makeTabKey(normalizeTabs(record)[0]?.name || DEFAULT_MEETING_TABS[0], 0);
  document.querySelector('#meetingListView').hidden = true;
  document.querySelector('#meetingFormView').hidden = false;
  document.querySelector('#meetingFormTitle').textContent = record.id ? '編輯會議紀錄' : '新增會議紀錄';
  document.querySelector('#meetingDate').value = record.date || today();
  document.querySelector('#meetingTime').value = record.time || currentTime();
  populateLocationSelect();
  document.querySelector('#meetingLocation').value = MEETING_LOCATIONS.includes(record.location) ? record.location : MEETING_LOCATIONS[0];
  document.querySelector('#meetingSerial').value = record.serial || record.number || getNextSerial();
  document.querySelector('#meetingStatus').value = record.status || (meetingStatusInfo(record).key === 'completed' ? 'completed' : 'auto');
  syncPostponedRequiredFields();
  document.querySelector('#meetingNote').value = record.note || '';
  populateStaffSelects();
  setSelectValue(document.querySelector('#meetingChair'), record.chair || '');
  setSelectValue(document.querySelector('#meetingRecorder'), record.recorder || '');
  setSelectValue(document.querySelector('#meetingMorningAttendees'), record.morningAttendees || []);
  setSelectValue(document.querySelector('#meetingEveningAttendees'), record.eveningAttendees || []);
  meetingState.files = Array.isArray(record.files) ? record.files.map((file) => ({ ...file })) : [];
  meetingState.removedBackendFiles = [];
  renderMeetingFiles();
  hydrateMeetingFileUrls();
  renderTabs(normalizeTabs(record));
  switchTab(meetingState.activeTab);
  setFormEditable();
};

const resizeMeetingTextarea = (textarea) => {
  if (!textarea || textarea.offsetParent === null) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
};

const resizeMeetingTextareas = (container) => {
  container?.querySelectorAll('.meeting-detail-table textarea').forEach(resizeMeetingTextarea);
};

const renderRows = (key, rows = []) => {
  const body = document.querySelector(`[data-tab-body="${key}"]`);
  const data = rows.length ? [...rows, {}] : [{}];
  body.innerHTML = data.map((row, index) => rowTemplate(key, index, row)).join('');
  data.forEach((row, index) => setSelectValue(body.querySelector(`[data-row-index="${index}"] [data-field="proposer"]`), row.proposer || ''));
  resizeMeetingTextareas(body);
};


const appendAndFocusMeetingRow = (body, focus = true) => {
  if (!body) return;
  const key = body.dataset.tabBody;
  const index = body.querySelectorAll('tr').length;
  body.insertAdjacentHTML('beforeend', rowTemplate(key, index, {}));
  const nextRow = body.querySelector(`[data-row-index="${index}"]`);
  setSelectValue(nextRow?.querySelector('[data-field="proposer"]'), '');
  setFormEditable();
  if (focus) nextRow?.querySelector('[data-field="proposer"]')?.focus();
};

const appendBlankMeetingRowIfNeeded = (control) => {
  if (!canEditMeeting()) return;
  const row = control?.closest('tr');
  const body = row?.closest('[data-tab-body]');
  if (!body || row !== body.lastElementChild) return;
  const hasValue = [...row.querySelectorAll('[data-field]')].some((field) =>
    field.dataset.field === 'image'
      ? normalizeMeetingImages(JSON.parse(field.dataset.imageValues || '[]')).length > 0
      : Boolean(field.value?.trim()));
  if (hasValue) appendAndFocusMeetingRow(body, false);
};

const focusFirstIncompleteMeetingField = (row) => {
  const requiredFields = ['proposer', 'content', 'solution'];
  const missing = requiredFields
    .map((field) => row.querySelector(`[data-field="${field}"]`))
    .find((control) => !control?.value?.trim());
  missing?.focus();
  return Boolean(missing);
};

const normalizeMeetingImages = (value) => Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []);

const rowTemplate = (key, index, row = {}) => `
  <tr data-row-index="${index}">
    <td><select data-staff-select data-field="proposer"><option value="">請選擇</option>${staffOptions()}</select></td>
    <td><textarea data-field="content" rows="3">${escapeHtml(row.content || '')}</textarea></td>
    <td><textarea data-field="solution" rows="3">${escapeHtml(row.solution || '')}</textarea></td>
    <td><textarea data-field="note" rows="2">${escapeHtml(row.note || '')}</textarea></td>
    <td>
      <div class="image-upload-area" tabindex="0">
        <div>Ctrl+V 貼上圖片</div>
        <input data-field="image" type="file" accept="image/*" multiple data-image-values="${escapeHtml(JSON.stringify(normalizeMeetingImages(row.images ?? row.image)))}">
        <div class="meeting-image-preview-list">${normalizeMeetingImages(row.images ?? row.image).map((image) => `<span class="ragic-file-preview meeting-image-preview image-upload-preview" data-image="${escapeHtml(image)}"><img src="${escapeHtml(image)}" alt="圖片預覽"><span>檢視</span><button class="image-preview-remove" type="button" aria-label="移除圖片">×</button></span>`).join('')}</div>
      </div>
    </td>
    <td><button class="ghost danger" data-delete-row="${key}" type="button">刪除</button></td>
  </tr>
`;

const switchTab = (key) => {
  if (!key) return;
  meetingState.activeTab = key;
  document.querySelectorAll('[data-meeting-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.meetingTab === key));
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== key; });
  resizeMeetingTextareas(document.querySelector(`[data-tab-panel="${key}"]`));
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

const uploadMeetingImageOriginal = async (file) => {
  if (!file) return '';
  if (!file.type?.startsWith('image/')) throw new Error('請選擇圖片檔案');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('單張圖片不可超過 50MB');
  const loadedImage = await loadImage(await readFileAsDataUrl(file));
  const scale = loadedImage.naturalWidth > 800 ? 800 / loadedImage.naturalWidth : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(loadedImage.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(loadedImage.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) return reject(new Error('圖片轉換失敗'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('圖片轉換失敗'));
    reader.readAsDataURL(blob);
  }, 'image/jpeg', 0.6));
};

const showImagePreview = (base64, container) => {
  if (!container || !base64) return;
  const input = container.querySelector('[data-field="image"]');
  const images = normalizeMeetingImages(input?.dataset.imageValues ? JSON.parse(input.dataset.imageValues) : []);
  images.push(base64);
  if (input) input.dataset.imageValues = JSON.stringify(images);
  const preview = document.createElement('span');
  preview.className = 'ragic-file-preview meeting-image-preview image-upload-preview';
  preview.dataset.image = base64;
  preview.innerHTML = `<img src="${escapeHtml(base64)}" alt="圖片預覽"><span>檢視</span><button class="image-preview-remove" type="button" aria-label="移除圖片">×</button>`;
  (container.querySelector('.meeting-image-preview-list') || container).appendChild(preview);
};

let meetingImageUploadCount = 0;
const setMeetingImageUploadBusy = (delta) => {
  meetingImageUploadCount = Math.max(0, meetingImageUploadCount + delta);
  const saveButton = document.querySelector('#saveMeetingButton');
  if (!saveButton) return;
  if (meetingImageUploadCount > 0) {
    if (!saveButton.dataset.imageUploadOriginalText) saveButton.dataset.imageUploadOriginalText = saveButton.textContent || '儲存';
    saveButton.disabled = true;
    saveButton.textContent = '圖片處理中…';
  } else if (saveButton.dataset.imageUploadOriginalText) {
    saveButton.disabled = false;
    saveButton.textContent = saveButton.dataset.imageUploadOriginalText;
    delete saveButton.dataset.imageUploadOriginalText;
  }
};

const processImageFile = async (file, container) => {
  const objectUrl = URL.createObjectURL(file);
  const preview = document.createElement('span');
  preview.className = 'ragic-file-preview meeting-image-preview image-upload-preview is-uploading';
  preview.innerHTML = `<img src="${escapeHtml(objectUrl)}" alt="圖片上傳預覽"><span>圖片處理中…</span>`;
  (container.querySelector('.meeting-image-preview-list') || container).appendChild(preview);
  setMeetingImageUploadBusy(1);
  try {
    const url = await uploadMeetingImageOriginal(file);
    preview.remove();
    showImagePreview(url, container);
    appendBlankMeetingRowIfNeeded(container.querySelector('[data-field="image"]'));
  } finally {
    URL.revokeObjectURL(objectUrl);
    preview.remove();
    setMeetingImageUploadBusy(-1);
  }
};

const handleImagePaste = async (event, imageArea) => {
  const items = event.clipboardData?.items;
  if (!items) return;
  const imageItems = [...items].filter((item) => item.type.startsWith('image/'));
  if (imageItems.length) event.preventDefault();
  for (const item of imageItems) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      await processImageFile(file, imageArea);
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
      if (field === 'image') item.image = normalizeMeetingImages(control?.dataset.imageValues ? JSON.parse(control.dataset.imageValues) : (previousRows[index]?.images ?? previousRows[index]?.image));
      else item[field] = control?.value?.trim() || '';
    }
    if (Object.values(item).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))) rows.push(item);
  }
  return rows;
};

const readForm = async () => {
  const tabs = [];
  for (let index = 0; index < meetingState.tabs.length; index += 1) {
    const tab = meetingState.tabs[index];
    tabs.push({ name: tab.name, rows: await readRows(makeTabKey(tab.name, index)) });
  }
  return ({
  date: document.querySelector('#meetingDate').value,
  time: document.querySelector('#meetingTime').value,
  location: document.querySelector('#meetingLocation').value.trim(),
  serial: document.querySelector('#meetingSerial').value.trim() || getNextSerial(),
  status: document.querySelector('#meetingStatus').value || 'auto',
  chair: document.querySelector('#meetingChair').value,
  recorder: document.querySelector('#meetingRecorder').value,
  morningAttendees: [...document.querySelector('#meetingMorningAttendees').selectedOptions].map((option) => option.value),
  eveningAttendees: [...document.querySelector('#meetingEveningAttendees').selectedOptions].map((option) => option.value),
  note: document.querySelector('#meetingNote').value.trim(),
  files: meetingState.files.filter((file) => !file.file && !file.pending).map(persistableMeetingFile),
  tabs,
  techRows: tabs[0]?.rows || [],
  csRows: tabs[1]?.rows || []
});
};

const openImagePreview = (src) => {
  document.querySelector('#meetingPreviewImage').src = src;
  document.querySelector('#meetingOpenOriginal').href = src;
  document.querySelector('#meetingImageModal').hidden = false;
};

const closeImagePreview = () => {
  document.querySelector('#meetingImageModal').hidden = true;
  document.querySelector('#meetingPreviewImage').removeAttribute('src');
};


const openMeetingFromQuery = () => {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id || meetingState.currentId === id) return;
  const record = meetingState.records.find((item) => item.id === id);
  if (record) showForm(record);
};

const initMeetingPage = async () => {
  if (window.permissionReady) await window.permissionReady;
  setFormEditable();
  meetingStaffCollection?.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    meetingState.defaultStaff = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(visibleMeetingStaff).map(staffName);
    if (!meetingState.staffLoaded) meetingState.staff = [...meetingState.defaultStaff];
    populateStaffSelects();
    renderStaffSettings();
    setFormEditable();
  }, (error) => {
    console.error('讀取會議人員資料失敗：', error);
    meetingState.defaultStaff = [];
    if (!meetingState.staffLoaded) meetingState.staff = [];
    meetingState.staffLoaded = true;
    populateStaffSelects();
    setFormEditable();
  });
  meetingDesignDoc?.onSnapshot((doc) => {
    const tabs = doc.exists ? (doc.data().defaultTabs || []) : [];
    DEFAULT_MEETING_TABS = Array.isArray(tabs) && tabs.length ? tabs : [...FALLBACK_MEETING_TABS];
    renderMeetingTableDesign();
  }, (error) => console.error('讀取會議表格設計失敗：', error));
  meetingSettingsDoc?.onSnapshot((doc) => {
    const names = doc.exists ? (doc.data().names || []) : [];
    meetingState.staff = names.length ? names : [...meetingState.defaultStaff];
    meetingState.staffLoaded = true;
    populateStaffSelects();
    renderStaffSettings();
    setFormEditable();
  }, (error) => console.error('讀取人員設定失敗：', error));
  meetingCollection?.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    meetingState.records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderList();
    openMeetingFromQuery();
    setFormEditable();
    void ensureCurrentMonthMeetings();
  });
};

document.querySelector('#meetingStatus')?.addEventListener('change', syncPostponedRequiredFields);
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
document.querySelector('#meetingTabs')?.addEventListener('click', async (event) => {
  const deleteKey = event.target.closest('[data-delete-tab]')?.dataset.deleteTab;
  if (deleteKey && canEditMeeting()) {
    event.stopPropagation();
    const tabIndex = meetingState.tabs.findIndex((tab, index) => makeTabKey(tab.name, index) === deleteKey);
    if (tabIndex >= 0 && confirm(`確定刪除「${meetingState.tabs[tabIndex].name}」？`)) {
      meetingState.tabs.splice(tabIndex, 1);
      meetingState.activeTab = makeTabKey(meetingState.tabs[0].name, 0);
      renderTabs(meetingState.tabs);
    }
    return;
  }
  if (event.target.closest('#addMeetingTabButton') && canEditMeeting()) {
    const name = prompt('請輸入會議名稱');
    const trimmed = name?.trim();
    if (trimmed) {
      const rows = [];
      for (let index = 0; index < meetingState.tabs.length; index += 1) rows.push(await currentRowsByKey(makeTabKey(meetingState.tabs[index].name, index)));
      meetingState.tabs = meetingState.tabs.map((tab, index) => ({ ...tab, rows: rows[index] || [] }));
      meetingState.tabs.push({ name: trimmed, rows: [] });
      meetingState.activeTab = makeTabKey(trimmed, meetingState.tabs.length - 1);
      renderTabs(meetingState.tabs);
      setFormEditable();
    }
    return;
  }
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
document.querySelector('#meetingForm')?.addEventListener('keydown', (event) => {
  const solution = event.target.closest('textarea[data-field="solution"]');
  if (!solution || event.key !== 'Enter' || event.shiftKey || event.isComposing || !canEditMeeting()) return;
  event.preventDefault();
  const row = solution.closest('tr');
  const body = row?.closest('[data-tab-body]');
  if (!row || !body || focusFirstIncompleteMeetingField(row)) return;
  const rows = [...body.querySelectorAll('tr')];
  if (row === rows[rows.length - 1]) appendAndFocusMeetingRow(body);
  else row.nextElementSibling?.querySelector('[data-field="proposer"]')?.focus();
});

document.querySelector('#meetingForm')?.addEventListener('input', (event) => {
  if (event.target.matches('[data-tab-body] textarea')) {
    resizeMeetingTextarea(event.target);
    appendBlankMeetingRowIfNeeded(event.target);
  }
});

window.addEventListener('resize', () => resizeMeetingTextareas(document.querySelector('#meetingTabPanels')));

document.querySelector('#meetingForm')?.addEventListener('change', async (event) => {
  if (event.target.matches('[data-tab-body] select')) appendBlankMeetingRowIfNeeded(event.target);
  const input = event.target.closest('[data-field="image"]');
  if (!input?.files?.[0]) return;
  try {
    for (const file of input.files) await processImageFile(file, input.closest('.image-upload-area'));
    input.value = '';
  }
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
      const previews = [...imageArea.querySelectorAll('.meeting-image-preview')];
      const removeIndex = previews.indexOf(removeButton.closest('.meeting-image-preview'));
      const images = normalizeMeetingImages(input.dataset.imageValues ? JSON.parse(input.dataset.imageValues) : []);
      if (removeIndex >= 0) images.splice(removeIndex, 1);
      input.value = '';
      input.dataset.imageValues = JSON.stringify(images);
    }
    removeButton.closest('.ragic-file-preview')?.remove();
    return;
  }
  const deleteKey = event.target.closest('[data-delete-row]')?.dataset.deleteRow;
  if (deleteKey && canEditMeeting()) {
    const body = event.target.closest('[data-tab-body]');
    event.target.closest('tr')?.remove();
    if (body && !body.querySelector('tr')) renderRows(deleteKey);
    else appendBlankMeetingRowIfNeeded(body?.lastElementChild?.querySelector('[data-field]'));
  }
  const image = event.target.closest('[data-image]')?.dataset.image;
  if (image) openImagePreview(image);
});
applyMeetingUploadAvailability();
document.querySelector('#meetingFileInput')?.addEventListener('change', async (event) => {
  try { await addMeetingFiles(event.target.files || []); event.target.value = ''; }
  catch (error) { alert(error.message || '檔案讀取失敗，請稍後再試。'); }
});
document.querySelector('#meetingFileDropZone')?.addEventListener('paste', (event) => {
  const files = [...(event.clipboardData?.files || [])];
  if (!files.length) return;
  event.preventDefault();
  addMeetingFiles(files).catch((error) => alert(error.message || '檔案讀取失敗，請稍後再試。'));
});
document.querySelector('#meetingFileList')?.addEventListener('click', (event) => {
  const previewIndex = event.target.closest('[data-preview-file]')?.dataset.previewFile;
  if (previewIndex !== undefined) {
    const file = meetingState.files[Number(previewIndex)];
    // 後端簽章網址有期限:表單開太久時先換新的再預覽
    const ready = isBackendMeetingFile(file) && !file.pending && !file.file ? freshBackendFileLink(file) : Promise.resolve();
    ready.then(() => openMeetingFilePreview(file)).catch((error) => alert(error.message || '檔案預覽失敗，請稍後再試。'));
    return;
  }
  const downloadIndex = event.target.closest('[data-download-file]')?.dataset.downloadFile;
  if (downloadIndex !== undefined) {
    downloadMeetingFile(meetingState.files[Number(downloadIndex)]).catch((error) => alert(`檔案下載失敗：${error.message || '請稍後再試。'}`));
    return;
  }
  const index = event.target.closest('[data-remove-file]')?.dataset.removeFile;
  if (index === undefined) return;
  removeMeetingFileAt(Number(index));
});
document.querySelector('#designMeetingTableButton')?.addEventListener('click', () => {
  if (!canDesignMeeting()) return alert('您沒有設計權限');
  renderMeetingTableDesign();
  document.querySelector('#meetingTableDesignModal').hidden = false;
});
document.querySelector('#closeMeetingTableDesignModal')?.addEventListener('click', () => { document.querySelector('#meetingTableDesignModal').hidden = true; });
document.querySelector('#saveMeetingTableDesignButton')?.addEventListener('click', saveMeetingTableDesign);
document.querySelector('#staffSettingsButton')?.addEventListener('click', () => {
  renderStaffSettings();
  document.querySelector('#staffSettingsModal').hidden = false;
});
document.querySelector('#closeStaffSettingsModal')?.addEventListener('click', () => { document.querySelector('#staffSettingsModal').hidden = true; });
document.querySelector('#addStaffSettingsName')?.addEventListener('click', async () => {
  const input = document.querySelector('#staffSettingsName');
  const name = input.value.trim();
  if (!name) return;
  if (!staffNames().includes(name)) meetingState.staff.push(name);
  input.value = '';
  populateStaffSelects();
  renderStaffSettings();
  await saveStaffSettings();
});
document.querySelector('#staffSettingsList')?.addEventListener('click', async (event) => {
  const name = event.target.closest('[data-remove-staff]')?.dataset.removeStaff;
  if (!name) return;
  meetingState.staff = staffNames().filter((item) => item !== name);
  populateStaffSelects();
  renderStaffSettings();
  await saveStaffSettings();
});

document.querySelector('#meetingForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canEditMeeting()) return alert('您沒有編輯權限');
  if (!meetingCollection) return alert('Firebase 尚未完成初始化，無法儲存資料。');
  const saveButton = document.querySelector('#saveMeetingButton');
  const originalText = saveButton.textContent;
  saveButton.disabled = true;
  saveButton.textContent = '儲存中...';
  let meetingSaved = false;
  const shiftedRecords = [];
  try {
    const data = await readForm();
    const previous = existingRecord();
    if (data.status === 'postponed' && previous.status !== 'postponed' && isWeeklyMeeting(data)) {
      const originalDate = data.date;
      const later = planWeeklyPostponement(originalDate, meetingState.currentId);
      for (const record of later) {
        await meetingCollection.doc(record.id).set({
          date: nextWeeklyDate(record.date),
          weeklyScheduledFor: record.weeklyScheduledFor || record.date,
          updatedAt: new Date()
        }, { merge: true });
        shiftedRecords.push(record);
      }
      data.date = nextWeeklyDate(originalDate);
      data.status = 'auto';
      data.weeklyScheduledFor = previous.weeklyScheduledFor || originalDate;
    }
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    let recordRef;
    if (meetingState.currentId) {
      recordRef = meetingCollection.doc(meetingState.currentId);
      await recordRef.set(data, { merge: true });
    } else {
      recordRef = await meetingCollection.add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      meetingState.currentId = recordRef.id;
    }
    // 新增完成後 currentId 已建立，立即顯示刪除按鈕，不必重新整理頁面。
    setFormEditable();
    meetingSaved = true;
    const hasPendingFiles = meetingState.files.some((file) => file.file || file.pending);
    if (hasPendingFiles) {
      const uploadedFiles = await uploadMeetingFiles(({ percent, fileName, transferred, totalBytes, bytesPerSecond }) => {
        saveButton.textContent = `上傳 ${percent.toFixed(2)}%`;
        saveButton.title = `正在上傳：${fileName}｜${formatMeetingBytes(transferred)} / ${formatMeetingBytes(totalBytes)}｜${formatMeetingBytes(bytesPerSecond)}/s`;
      });
      await recordRef.set({ files: uploadedFiles.map(persistableMeetingFile), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    await trashRemovedBackendFiles();
    showList();
  } catch (error) {
    console.error(error);
    if (!meetingSaved) {
      for (const record of shiftedRecords.reverse()) {
        try {
          await meetingCollection.doc(record.id).set({
            date: record.date,
            weeklyScheduledFor: record.weeklyScheduledFor || record.date,
            updatedAt: new Date()
          }, { merge: true });
        } catch (rollbackError) {
          console.error('還原延期排程失敗：', rollbackError);
        }
      }
    }
    alert(meetingSaved ? `會議內容已儲存，但附件上傳失敗：${error.message || '請稍後再試。'}` : (error.message || '儲存失敗，請稍後再試。'));
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = originalText;
    saveButton.removeAttribute('title');
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
document.querySelector('#meetingImageFullscreen')?.addEventListener('click', () => document.querySelector('#meetingImageModal .ragic-image-modal-card')?.requestFullscreen?.());
document.querySelector('#closeMeetingFilePreviewModal')?.addEventListener('click', closeMeetingFilePreview);
document.querySelector('#meetingFilePreviewModal')?.addEventListener('click', (event) => { if (event.target.id === 'meetingFilePreviewModal') closeMeetingFilePreview(); });

initMeetingPage();
