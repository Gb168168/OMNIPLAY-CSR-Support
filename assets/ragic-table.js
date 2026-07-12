const RAGIC_STATE = { records: [], filtered: [], currentId: null, sortKey: '', sortDir: 'asc', filters: {}, openMenuKey: '', page: 1, pageSize: 50, config: null, schema: null, unsubscribeRecords: null, collection: null };

const FIELD_TYPE_GROUPS = [
  { label: '📝 文字', types: [{ value: 'text', label: '單行' }, { value: 'textarea', label: '多行' }] },
  { label: '🕐 時間', types: [{ value: 'date', label: '日期' }, { value: 'datetime', label: '日期時間' }, { value: 'createdDate', label: '建立日期' }, { value: 'updatedDate', label: '更新時間' }] },
  { label: '📋 下拉', types: [{ value: 'select', label: '單選' }, { value: 'multiselect', label: '多選' }] },
  { label: '🔗 連結', types: [{ value: 'link', label: '連結' }] },
  { label: '🖼️ 圖片', types: [{ value: 'image', label: '圖片' }] },
  { label: '📎 檔案', types: [{ value: 'file', label: '檔案' }] },
  { label: '🔢 編號', types: [{ value: 'serial', label: '編號' }] },
  { label: '📊 子表格', types: [{ value: 'subtable', label: '子表格' }] }
];
const FIELD_TYPES = FIELD_TYPE_GROUPS.flatMap((group) => group.types);
const LEGACY_FIELD_TYPES = [
  { value: 'number', label: '數字（舊）' },
  { value: 'time', label: '時間（舊）' },
  { value: 'person', label: '人員選擇（舊）' }
];

const COLLECTION_MAP = { workHandover: 'handover', workLogs: 'log', workReports: 'report', workTracking: 'tracking', workAlerts: 'alert', meetingRecords: 'meeting', knowledgeBase: 'knowledge', aiDatabase: 'ai_database' };
const SCHEMA_MAP = { handover: 'handover_schema', log: 'log_schema', report: 'report_schema', tracking: 'tracking_schema', alert: 'alert_schema', meeting: 'meeting_schema', knowledge: 'knowledge_schema', ai_database: 'ai_database_schema' };

const normalizeKey = (text, fallback = 'field') => String(text || fallback).trim().replace(/[^\w\u4e00-\u9fa5]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || `${fallback}_${Date.now()}`;
const valueToText = (value) => Array.isArray(value) ? value.join('、') : (value?.toDate ? formatLocalDateTime(value.toDate()) : (value?.name && value?.data ? `${value.name} (${formatFileSize(value.size)})` : (value ?? '')));
const formatLocalDateTime = (date = new Date()) => date.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const formatFileSize = (bytes = 0) => { const size = Number(bytes) || 0; if (size < 1024) return `${size} B`; if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`; return `${(size / 1024 / 1024).toFixed(1)} MB`; };
const today = () => new Date().toISOString().slice(0, 10);
const normalizeDateValue = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const dtMatch = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s+(\d{1,2}:\d{2})/);
  if (dtMatch) return `${dtMatch[1]}-${dtMatch[2].padStart(2, '0')}-${dtMatch[3].padStart(2, '0')}T${dtMatch[4]}`;
  const parts = text.split('/');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return text;
};
const displayDate = (value) => value ? String(value).replace(/-/g, '/') : '';
const displayDateTime = (value) => value ? String(value).replace('T', ' ').replace(/-/g, '/') : '';
const dataCollectionName = (config) => config.dataCollection || COLLECTION_MAP[config.collection] || config.collection;
const schemaCollectionName = (config) => config.schemaCollection || SCHEMA_MAP[dataCollectionName(config)] || `${dataCollectionName(config)}_schema`;
const generateFieldKey = () => 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
const shouldRegenerateFieldKey = (key) => !String(key || '').trim() || String(key).trim() === '新欄位' || String(key).trim() === '新子欄位';
const uniqueKey = (key, usedKeys = new Set(), fallback = 'field') => {
  const base = normalizeKey(key, fallback);
  let candidate = base;
  let index = 1;
  while (usedKeys.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  usedKeys.add(candidate);
  return candidate;
};
const normalizeFields = (fields = [], fallbackPrefix = 'field') => {
  const usedKeys = new Set();
  return fields.map((field, index) => normalizeField(field, `${fallbackPrefix}_${index + 1}`, usedKeys));
};
const normalizeField = (field = {}, fallback = 'field', usedKeys = new Set()) => {
  const label = String(field.label || field.key || '未命名欄位');
  return {
    ...field,
    key: uniqueKey(field.key || label, usedKeys, fallback),
    label,
    type: field.type || 'text',
    width: normalizeFieldWidth(field.width),
    options: optionList(field),
    fields: normalizeFields(field.fields || [], 'subfield')
  };
};
const normalizeSchema = (schema = {}) => ({ fields: normalizeFields(schema.fields || [], 'field') });
const fixDuplicateKeys = (fields = []) => {
  const seen = new Set();
  let changed = false;
  fields.forEach((field) => {
    if (shouldRegenerateFieldKey(field.key) || seen.has(field.key)) {
      let nextKey = generateFieldKey();
      while (seen.has(nextKey)) nextKey = generateFieldKey();
      field.key = nextKey;
      changed = true;
    }
    seen.add(field.key);
    if (Array.isArray(field.fields) && fixDuplicateKeys(field.fields)) changed = true;
  });
  return changed;
};
const getFields = () => RAGIC_STATE.schema?.fields || [];
const listFields = () => getFields().filter((field) => field.type !== 'subtable');
const listColumns = () => listFields().map((field) => field.key);
const fieldByKey = (key) => getFields().find((field) => field.key === key);
const optionList = (field) => Array.isArray(field.options) ? field.options : String(field.options || '').split('\n').map((item) => item.trim()).filter(Boolean);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const fieldSelector = (fieldKey) => `[data-field="${window.CSS?.escape ? CSS.escape(fieldKey) : String(fieldKey).replace(/\"/g, '\\"')}"]`;

const MAX_IMAGE_WIDTH = 800;
const JPEG_QUALITY = 0.6;
const MAX_IMAGE_BYTES = 900 * 1024;
const MAX_IMAGE_TOTAL_BYTES = 800 * 1024;
const IMAGE_TOTAL_LIMIT_MESSAGE = '圖片總大小超過限制，請減少圖片數量或降低解析度';
if (!window._multiSelectClickBound) {
  document.addEventListener('click', () => document.querySelectorAll('.multi-select-dropdown.show').forEach((dropdown) => dropdown.classList.remove('show')));
  window._multiSelectClickBound = true;
}
const SERIAL_PREFIX_MAP = { handover: 'HO-', log: 'LOG-', meeting: 'MTG-', report: 'RPT-', tracking: 'TRK-', alert: 'ALT-', knowledge: 'KB-', ai_database: 'AI-' };
const readonlyFieldTypes = new Set(['createdDate', 'updatedDate', 'serial']);
const inlineReadonlyFieldTypes = new Set([...readonlyFieldTypes, 'image', 'file', 'subtable']);
const DEFAULT_FIELD_WIDTHS = { date: 100, datetime: 150, select: 100, multiselect: 100, image: 80, serial: 90, createdDate: 150, updatedDate: 150, link: 150 };
const normalizeFieldWidth = (width) => { const value = Number(width); return Number.isFinite(value) && value > 0 ? Math.round(value) : null; };
const fieldColumnWidth = (field = {}) => normalizeFieldWidth(field.width) || DEFAULT_FIELD_WIDTHS[field.type] || null;

const currentRagicUser = () => sessionStorage.getItem('account') || sessionStorage.getItem('omniplayStaffAccount') || sessionStorage.getItem('omniplayStaffCode') || '';

const normalizeColumnText = (value = '') => String(value || '').replace(/\s+/g, '').toLowerCase();
const ragicColumnClass = (field = {}) => {
  const text = normalizeColumnText(`${field.key || ''}${field.label || ''}`);
  if (/(date|日期|時間)/.test(text)) return 'col-date';
  if (/(shift|班別)/.test(text)) return 'col-shift';
  if (/(dept|department|部門)/.test(text)) return 'col-dept';
  if (/(category|分類)/.test(text)) return 'col-category';
  if (/(status|狀態)/.test(text)) return 'col-status';
  if (/(content|handover|事項|交接事項|內容|description|說明)/.test(text)) return 'col-content';
  return 'col-content';
};
const cellTooltipText = (record, field) => {
  const value = record?.[field.key];
  if (field?.type === 'date') return displayDate(value);
  if (field?.type === 'datetime') return displayDateTime(value);
  return String(valueToText(value));
};
const renderIconActions = (record = {}) => {
  const currentUser = currentRagicUser();
  const pinned = Boolean(currentUser && record.pins?.[currentUser]);
  return `<td class="icon-actions col-marker">
    <span class="fire-btn ${record.fire ? 'active' : ''}" data-icon-action="fire" data-doc-id="${escapeHtml(record.id)}" role="button" tabindex="0" title="重要/今日交接">🔥</span>
    <span class="pin-btn ${pinned ? 'active' : ''}" data-icon-action="pin" data-doc-id="${escapeHtml(record.id)}" role="button" tabindex="0" title="個人釘選">📌</span>
  </td>`;
};

const makeDefaultSchema = (config) => normalizeSchema({
  fields: [...(config.fields || []), ...(config.subtable ? [{ ...config.subtable, type: 'subtable', fields: config.subtable.fields || [] }] : [])]
});

const createMultiSelectControl = (field, value = '', subfield = false) => {
  const selected = Array.isArray(value) ? value : String(value || '').split(/[、,]/).map((item) => item.trim()).filter(Boolean);
  const wrapper = document.createElement('div');
  wrapper.className = 'multi-select ragic-multi-select';
  const select = document.createElement('select');
  select.multiple = true;
  select.hidden = true;
  select.name = subfield ? '' : field.key;
  if (subfield) select.dataset.subfield = field.key;
  optionList(field).forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    opt.selected = selected.includes(option);
    select.appendChild(opt);
  });
  const display = document.createElement('div');
  display.className = 'multi-select-display';
  display.textContent = selected.length ? selected.join('、') : '請選擇';
  display.title = selected.join('、');
  const dropdown = document.createElement('div');
  dropdown.className = 'multi-select-dropdown';
  dropdown.setAttribute('role', 'listbox');
  dropdown.setAttribute('aria-multiselectable', 'true');
  optionList(field).forEach((option) => {
    const label = document.createElement('label');
    label.setAttribute('role', 'option');
    label.setAttribute('aria-selected', String(selected.includes(option)));
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(option)}" ${selected.includes(option) ? 'checked' : ''}><span>${escapeHtml(option)}</span>`;
    dropdown.appendChild(label);
  });
  wrapper.append(select, display, dropdown);
  display.addEventListener('click', (event) => {
    event.stopPropagation();
    if (select.disabled) return;
    document.querySelectorAll('.multi-select-dropdown.show').forEach((item) => { if (item !== dropdown) item.classList.remove('show'); });
    dropdown.classList.toggle('show');
  });
  dropdown.addEventListener('click', (event) => event.stopPropagation());
  dropdown.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const option = [...select.options].find((item) => item.value === checkbox.value);
      if (option) option.selected = checkbox.checked;
      checkbox.closest('[role="option"]')?.setAttribute('aria-selected', String(checkbox.checked));
      const values = [...select.selectedOptions].map((option) => option.value);
      display.textContent = values.length ? values.join('、') : '請選擇';
      display.title = values.join('、');
    });
  });
  return wrapper;
};

const createControl = (field, value = '', subfield = false) => {
  if (field.type === 'multiselect') return createMultiSelectControl(field, value, subfield);
  let input;
  if (field.type === 'textarea') { input = document.createElement('textarea'); input.rows = field.rows || 4; }
  else if (field.type === 'select') {
    input = document.createElement('select');
    optionList(field).forEach((option) => { const opt = document.createElement('option'); opt.value = option; opt.textContent = option; input.appendChild(opt); });
  } else if (readonlyFieldTypes.has(field.type)) {
    input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
  } else {
    input = document.createElement('input');
    input.type = field.type === 'datetime' ? 'datetime-local' : (field.type === 'link' ? 'url' : (field.type === 'image' || field.type === 'file' ? 'file' : (field.type || 'text')));
    if (field.type === 'image') { input.accept = 'image/*'; input.multiple = true; }
  }
  input.name = subfield ? '' : field.key;
  input.required = field.type === 'image' || field.type === 'file' || readonlyFieldTypes.has(field.type) ? false : Boolean(field.required);
  input.placeholder = field.placeholder || '';
  if (subfield) input.dataset.subfield = field.key;
  if (field.type !== 'image' && field.type !== 'file') {
    const controlValue = field.type === 'date' || field.type === 'datetime' ? normalizeDateValue(value) : value;
    input.value = controlValue || field.defaultValue || (field.type === 'date' && !subfield ? today() : '');
  }
  return input;
};


const inlineValue = (value, field) => {
  if (field?.type === 'date' || field?.type === 'datetime' || field?.type === 'link') return String(value || '');
  if (field?.type === 'multiselect') return Array.isArray(value) ? value : String(value || '').split(/[、,]/).map((item) => item.trim()).filter(Boolean);
  return String(value ?? '');
};
const autoGrowTextarea = (textarea) => {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
};
const createInlineEditor = (field, value) => {
  const currentValue = inlineValue(value, field);
  if (field.type === 'multiselect') {
    const control = createMultiSelectControl(field, currentValue);
    control.querySelector('.multi-select-display')?.setAttribute('tabindex', '0');
    return control;
  }
  const control = createControl(field, currentValue);
  control.required = false;
  if (field.type === 'textarea') {
    control.rows = Math.max(2, field.rows || 2);
    control.addEventListener('input', () => autoGrowTextarea(control));
    requestAnimationFrame(() => autoGrowTextarea(control));
  }
  return control;
};
const getInlineEditorValue = (editor, field) => {
  if (field.type === 'multiselect') return [...editor.querySelectorAll('select option:checked')].map((option) => option.value);
  return editor.value;
};
const focusInlineEditor = (editor, field) => {
  const focusTarget = field.type === 'multiselect' ? editor.querySelector('.multi-select-display') : editor;
  focusTarget?.focus?.();
  if (editor.select && field.type !== 'date' && field.type !== 'datetime') editor.select();
};
const finishInlineEdit = async (td, { cancel = false } = {}) => {
  if (!td?.classList.contains('editing') || td.dataset.savingInline === 'true') return;
  const record = RAGIC_STATE.records.find((item) => item.id === td.dataset.docId);
  const field = fieldByKey(td.dataset.fieldKey);
  if (!record || !field) return;
  const editor = td._inlineEditor;
  const originalValue = td._inlineOriginalValue;
  td.dataset.savingInline = 'true';
  try {
    if (!cancel) {
      const newValue = getInlineEditorValue(editor, field);
      const changed = field.type === 'multiselect'
        ? JSON.stringify(newValue) !== JSON.stringify(originalValue)
        : String(newValue ?? '') !== String(originalValue ?? '');
      if (changed) {
        await RAGIC_STATE.collection.doc(record.id).update({
          [field.key]: newValue,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  } catch (error) {
    console.error(error);
    alert(error.message || '自動儲存失敗，請稍後再試。');
  } finally {
    td.classList.remove('editing');
    delete td.dataset.savingInline;
    delete td._inlineEditor;
    delete td._inlineOriginalValue;
    td.innerHTML = renderCell(record, field);
  }
};
const startInlineEdit = (td) => {
  if (!canUse('edit') || !RAGIC_STATE.collection || td?.classList.contains('editing')) return;
  const record = RAGIC_STATE.records.find((item) => item.id === td.dataset.docId);
  const field = fieldByKey(td.dataset.fieldKey);
  if (!record || !field || inlineReadonlyFieldTypes.has(field.type)) return;
  document.querySelectorAll('#ragicTableBody td.editing').forEach((cell) => { if (cell !== td) finishInlineEdit(cell); });
  const originalValue = inlineValue(record[field.key], field);
  const editor = createInlineEditor(field, originalValue);
  td._inlineEditor = editor;
  td._inlineOriginalValue = Array.isArray(originalValue) ? [...originalValue] : originalValue;
  td.classList.add('editing');
  td.innerHTML = '';
  td.appendChild(editor);
  const finishOnBlur = (event) => {
    requestAnimationFrame(() => {
      if (!td.contains(document.activeElement) && !td.contains(event.relatedTarget)) finishInlineEdit(td);
    });
  };
  editor.addEventListener('focusout', finishOnBlur);
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finishInlineEdit(td, { cancel: true });
    }
    if (event.key === 'Enter' && field.type !== 'textarea' && field.type !== 'multiselect') {
      event.preventDefault();
      finishInlineEdit(td);
    }
  });
  focusInlineEditor(editor, field);
};

const createField = (field, value = '') => {
  const wrap = document.createElement('label'); wrap.className = `ragic-field ragic-field-${field.type || 'text'}`; wrap.innerHTML = `<span>${field.label}${field.required ? ' *' : ''}</span>`;
  const control = createControl(field, value);
  if (field.type === 'image' || field.type === 'file') {
    const fileArea = document.createElement('div');
    fileArea.className = 'image-upload-area';
    fileArea.tabIndex = 0;
    fileArea.dataset.field = field.key;
    fileArea.dataset.fileLabel = field.label;
    fileArea.dataset.fileType = field.type;
    fileArea.innerHTML = `<div>選擇檔案 或 Ctrl+V 貼上${field.type === 'image' ? '圖片' : '檔案'}</div>`;
    fileArea.appendChild(control);
    wrap.appendChild(fileArea);
    if (value) field.type === 'image' ? showImagePreview(normalizeImageArray(value), fileArea, field.label) : showFilePreview(value, fileArea);
  } else {
    wrap.appendChild(control);
  }
  return wrap;
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error('圖片讀取失敗'));
  reader.readAsDataURL(file);
});


const fileToBase64Payload = async (file) => ({ name: file.name, size: file.size, type: file.type || 'application/octet-stream', data: await readFileAsDataUrl(file) });

const normalizeImageArray = (images) => {
  if (typeof images === 'string') return images ? [images] : [];
  if (Array.isArray(images)) return images.filter(Boolean);
  return [];
};

const estimateBase64Bytes = (value = '') => {
  const base64 = String(value).split(',').pop() || '';
  return Math.ceil(base64.length * 3 / 4);
};

const imageTotalBytes = (images = []) => normalizeImageArray(images).reduce((total, image) => total + estimateBase64Bytes(image), 0);

const assertImageTotalWithinLimit = (images = []) => {
  if (imageTotalBytes(images) > MAX_IMAGE_TOTAL_BYTES) throw new Error(IMAGE_TOTAL_LIMIT_MESSAGE);
};

const clearFilePreview = (container) => {
  const input = container?.querySelector('input[type="file"]');
  container?.querySelector('.image-preview-list')?.remove();
  container?.querySelector('img')?.remove();
  container?.querySelectorAll('.image-preview-item').forEach((item) => item.remove());
  container?.querySelector('.ragic-file-preview')?.remove();
  if (input) {
    input.value = '';
    delete input.dataset.imageValue;
    delete input.dataset.fileValue;
  }
  if (container) {
    container.dataset.imageCleared = 'true';
    container.dataset.fileCleared = 'true';
  }
};

const removeImage = (fieldKey) => {
  if (!fieldKey || !confirm('確定刪除此圖片？')) return;
  clearFilePreview(document.querySelector(fieldSelector(fieldKey)));
};
window.removeImage = removeImage;

const createRemoveButton = (fieldKey, title = '刪除圖片', container = null, onRemove = null) => {
  const button = document.createElement('button');
  button.className = 'image-remove-btn';
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.textContent = '✕';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (onRemove) {
      onRemove();
      return;
    }
    const targetContainer = container || button.closest('.image-upload-area') || (fieldKey ? document.querySelector(fieldSelector(fieldKey)) : null);
    clearFilePreview(targetContainer);
  });
  return button;
};

const showFilePreview = (payload, container) => {
  if (!container || !payload) return;
  const file = typeof payload === 'string' ? { name: '檔案', size: 0, data: payload } : payload;
  const input = container.querySelector('input[type="file"]');
  const fieldKey = container.dataset.field || input?.name || '';
  if (input) input.dataset.fileValue = JSON.stringify(file);
  delete container.dataset.imageCleared;
  delete container.dataset.fileCleared;
  container.querySelector('.ragic-file-preview')?.remove();
  container.querySelector('.image-preview-item')?.remove();
  const src = file.data || '';
  const isImage = String(src).startsWith('data:image') || String(file.type || '').startsWith('image/');
  if (isImage) {
    const preview = document.createElement('div');
    preview.className = 'image-preview-item ragic-file-preview image-upload-preview';
    preview.dataset.image = src;
    preview.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(file.name || container.dataset.fileLabel || '檔案')}預覽" style="max-height:100px; border-radius:6px;"><span>${escapeHtml(file.name || '檔案')}</span>`;
    preview.appendChild(createRemoveButton(fieldKey, '刪除圖片', container));
    preview.addEventListener('click', (event) => {
      if (event.target.closest('.image-remove-btn')) return;
      openImagePreview(src, file.name || container.dataset.fileLabel || '圖片');
    });
    container.appendChild(preview);
    return;
  }
  const preview = document.createElement('a');
  preview.className = 'ragic-file-preview ragic-download-preview image-preview-item';
  preview.href = src;
  preview.download = file.name || 'download';
  preview.innerHTML = `<span>📎 ${escapeHtml(file.name || '檔案')}</span><small>${escapeHtml(formatFileSize(file.size))}</small>`;
  preview.appendChild(createRemoveButton(fieldKey, '刪除檔案', container));
  container.appendChild(preview);
};
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
  if (size > MAX_IMAGE_BYTES) throw new Error('圖片太大，請選擇較小的圖片');
  return dataUrl;
};

const showImagePreview = (base64List, container, label = container?.dataset.fileLabel || '圖片') => {
  if (!container) return;
  const images = normalizeImageArray(base64List);
  const input = container.querySelector('input[type="file"]');
  const fieldKey = container.dataset.field || input?.name || '';
  if (input) input.dataset.imageValue = JSON.stringify(images);
  delete container.dataset.imageCleared;
  delete container.dataset.fileCleared;
  container.querySelector('.ragic-file-preview')?.remove();
  container.querySelector('.image-preview-list')?.remove();
  container.querySelectorAll('.image-preview-item').forEach((item) => item.remove());
  if (!images.length) return;
  const list = document.createElement('div');
  list.className = 'image-preview-list';
  images.forEach((base64, index) => {
    const preview = document.createElement('div');
    preview.className = 'image-preview-item image-upload-preview';
    preview.dataset.image = base64;
    preview.innerHTML = `<img src="${escapeHtml(base64)}" alt="${escapeHtml(label)}預覽 ${index + 1}" style="max-height:80px; border-radius:6px;"><span>點擊放大檢視</span>`;
    preview.appendChild(createRemoveButton(fieldKey, '刪除圖片', container, () => {
      const currentImages = getImageInputValues(input);
      currentImages.splice(index, 1);
      showImagePreview(currentImages, container, label);
      if (!currentImages.length) container.dataset.imageCleared = 'true';
    }));
    preview.addEventListener('click', (event) => {
      if (event.target.closest('.image-remove-btn')) return;
      openImagePreview(base64, label);
    });
    list.appendChild(preview);
  });
  container.appendChild(list);
};

const getImageInputValues = (input) => {
  if (!input?.dataset.imageValue) return [];
  try { return normalizeImageArray(JSON.parse(input.dataset.imageValue)); }
  catch (_) { return normalizeImageArray(input.dataset.imageValue); }
};

const getCurrentFormImages = (excludeInput = null) => [...document.querySelectorAll('.image-upload-area[data-file-type="image"] input[type="file"]')]
  .filter((input) => input !== excludeInput)
  .flatMap((input) => getImageInputValues(input));

const processImageFiles = async (files, container) => {
  const input = container?.querySelector('input[type="file"]');
  const currentImages = getImageInputValues(input);
  const newImages = [];
  for (const file of [...(files || [])]) newImages.push(await compressImageToBase64(file));
  const nextImages = [...currentImages, ...newImages];
  assertImageTotalWithinLimit([...getCurrentFormImages(input), ...nextImages]);
  showImagePreview(nextImages, container);
  if (input) input.value = '';
};

const processGenericFile = async (file, container) => {
  showFilePreview(await fileToBase64Payload(file), container);
};

const handleImagePaste = async (event, imageArea) => {
  const items = event.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    if (imageArea.dataset.fileType !== 'file' && !item.type.startsWith('image/')) continue;
    event.preventDefault();
    const file = item.getAsFile();
    if (imageArea.dataset.fileType === 'file') {
      await processGenericFile(file, imageArea);
      break;
    }
    if (file) files.push(file);
  }
  if (files.length) await processImageFiles(files, imageArea);
};

const getFormData = async () => {
  const data = {};
  const allImages = [];
  for (const field of getFields()) {
    if (field.type === 'subtable') {
      data[field.key] = [...document.querySelectorAll(`[data-subtable="${field.key}"] .subtable-row`)].map((row) => {
        const item = {}; (field.fields || []).forEach((sub) => { const control = row.querySelector(`[data-subfield="${sub.key}"]`); item[sub.key] = sub.type === 'multiselect' ? [...control.selectedOptions].map((opt) => opt.value) : (control?.value?.trim() || ''); }); return item;
      }).filter((item) => Object.values(item).some((value) => Array.isArray(value) ? value.length : value));
      continue;
    }
    const input = document.querySelector(`[name="${field.key}"]`); if (!input) continue;
    if (field.type === 'multiselect') data[field.key] = [...input.selectedOptions].map((opt) => opt.value);
    else if (field.type === 'image') {
      const container = input.closest('.image-upload-area');
      const images = container?.dataset.imageCleared === 'true' ? [] : getImageInputValues(input);
      assertImageTotalWithinLimit(images);
      data[field.key] = images;
      allImages.push(...images);
    } else if (field.type === 'file') {
      const container = input.closest('.image-upload-area');
      data[field.key] = container?.dataset.fileCleared === 'true' ? '' : (input.files?.[0] ? await fileToBase64Payload(input.files[0]) : (input.dataset.fileValue ? JSON.parse(input.dataset.fileValue) : ''));
    }
    else data[field.key] = input.value.trim();
  }
  assertImageTotalWithinLimit(allImages);
  return data;
};

const renderSubtableRow = (field, item = {}) => {
  const row = document.createElement('tr'); row.className = 'subtable-row';
  (field.fields || []).forEach((sub, index) => {
    const td = document.createElement('td');
    td.appendChild(createControl(sub, item[sub.key], true));
    if (index === 0) {
      const removeButton = document.createElement('button');
      removeButton.className = 'subtable-row-delete ghost danger';
      removeButton.type = 'button';
      removeButton.title = '刪除此列';
      removeButton.setAttribute('aria-label', '刪除此列');
      removeButton.textContent = '×';
      removeButton.addEventListener('click', () => row.remove());
      td.appendChild(removeButton);
    }
    row.appendChild(td);
  });
  return row;
};

const renderForm = (record = {}) => {
  RAGIC_STATE.currentId = record.id || null; document.querySelector('#ragicListView').hidden = true; const formView = document.querySelector('#ragicFormView'); formView.hidden = false;
  formView.querySelector('h2').textContent = record.id ? `編輯${RAGIC_STATE.config.title}` : `新增${RAGIC_STATE.config.title}`; const form = formView.querySelector('form'); form.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'ragic-form-grid';
  getFields().filter((field) => field.type !== 'subtable').forEach((field) => grid.appendChild(createField(field, record[field.key]))); form.appendChild(grid);
  getFields().filter((field) => field.type === 'subtable').forEach((field) => { const section = document.createElement('section'); section.className = 'ragic-subtable'; section.dataset.subtable = field.key; section.innerHTML = `<div class="ragic-subtable-head"><h3>${field.label}</h3><button class="secondary" type="button">+ 新增明細</button></div><div class="ragic-table-wrap"><table><thead><tr>${(field.fields || []).map((f) => `<th${fieldColumnWidth(f) ? ` style="width: ${fieldColumnWidth(f)}px;"` : ''}>${f.label}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`; const body = section.querySelector('tbody'); ((record[field.key]?.length ? record[field.key] : [{}])).forEach((item) => body.appendChild(renderSubtableRow(field, item))); section.querySelector('button').addEventListener('click', () => { if (canUse('edit')) body.appendChild(renderSubtableRow(field)); }); form.appendChild(section); });
  form.querySelectorAll('.image-upload-area').forEach((imageArea) => {
    const input = imageArea.querySelector('input[type="file"]');
    input?.addEventListener('change', async () => {
      if (!input.files?.[0]) return;
      try { imageArea.dataset.fileType === 'file' ? await processGenericFile(input.files[0], imageArea) : await processImageFiles(input.files, imageArea); }
      catch (error) { alert(error.message || '圖片處理失敗，請稍後再試。'); input.value = ''; }
    });
    imageArea.addEventListener('paste', (event) => handleImagePaste(event, imageArea).catch((error) => alert(error.message || '圖片處理失敗，請稍後再試。')));
  });
  setFormEditable(form);
  applyRagicPermissionUi();
};

const renderFileCell = (value, label = '圖片') => {
  if (!value) return '';
  const images = normalizeImageArray(value);
  if (images.length) {
    const firstImage = images[0];
    if (images.length === 1) return `<img class="ragic-thumbnail" src="${escapeHtml(firstImage)}" alt="${escapeHtml(label)}" title="點擊放大檢視">`;
    return `<span class="image-thumb-stack"><img class="ragic-thumbnail" src="${escapeHtml(firstImage)}" alt="${escapeHtml(label)}" title="點擊放大檢視"><span class="image-count-badge">${escapeHtml(images.length)}</span></span>`;
  }
  const src = typeof value === 'string' ? value : value.data;
  const name = typeof value === 'string' ? value : (value.name || '檔案');
  const size = typeof value === 'string' ? '' : (value.size ? ` (${formatFileSize(value.size)})` : '');
  if (src && String(src).startsWith('data:image')) {
    return `<img class="ragic-thumbnail" src="${escapeHtml(src)}" alt="${escapeHtml(label)}" title="點擊放大檢視">`;
  }
  if (!src) return '';
  return `<a class="ragic-file-link" href="${escapeHtml(src)}" target="_blank" rel="noopener" download="${escapeHtml(name || 'download')}">📎 ${escapeHtml(name || src)}${escapeHtml(size)}</a>`;
};

const renderCell = (record, field) => {
  const key = field.key;
  const value = record[key];
  if (field?.type === 'image' || field?.type === 'file') return renderFileCell(value, field.label || '圖片');
  if (field?.type === 'file') return value ? `<a class="ragic-file-link" href="${escapeHtml(value.data || value)}" download="${escapeHtml(value.name || 'download')}">📎 ${escapeHtml(value.name || '檔案')} ${escapeHtml(value.size ? `(${formatFileSize(value.size)})` : '')}</a>` : '';
  if (field?.type === 'link') return value ? `<a class="ragic-link" href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>` : '';
  if (field?.type === 'date') return escapeHtml(displayDate(value));
  if (field?.type === 'datetime') return escapeHtml(displayDateTime(value));
  const text = String(valueToText(value));
  if (field?.type === 'textarea' && text.length > 50) return `${escapeHtml(text.slice(0, 50))}...`;
  return escapeHtml(text);
};
const openImagePreview = (src, label = '圖片') => {
  const modal = document.querySelector('#ragicImageModal');
  modal.querySelector('h2').textContent = label;
  modal.querySelector('img').src = src;
  modal.hidden = false;
};
const closeImagePreview = () => {
  const modal = document.querySelector('#ragicImageModal');
  if (!modal) return;
  modal.hidden = true;
  modal.querySelector('img').removeAttribute('src');
};
const ragicPageSizeKey = () => `ragicPageSize:${RAGIC_STATE.config?.collection || 'default'}`;
const getTotalPages = () => Math.max(1, Math.ceil(RAGIC_STATE.filtered.length / RAGIC_STATE.pageSize));
const clampRagicPage = () => { RAGIC_STATE.page = Math.min(Math.max(1, RAGIC_STATE.page), getTotalPages()); };
const ensurePagination = () => {
  const toolbar = document.querySelector('#ragicListView .ragic-toolbar');
  const newRecordButton = document.querySelector('#newRecordButton');
  const existingPagination = document.querySelector('#ragicPagination');
  if (existingPagination && existingPagination.parentElement !== toolbar) existingPagination.remove();
  if (!toolbar || document.querySelector('#ragicPagination')) return;
  const paginationHtml = `<div class="ragic-pagination" id="ragicPagination"><label class="page-size">顯示 <select id="ragicPageSizeSelect"><option value="50">50</option><option value="100">100</option><option value="150">150</option><option value="200">200</option></select> 筆</label><div class="page-nav"><span id="ragicPageStatus">第 1/1 頁</span><button class="secondary" id="ragicPrevPage" type="button">上一頁</button><button class="secondary" id="ragicNextPage" type="button">下一頁</button></div></div>`;
  if (newRecordButton?.parentElement === toolbar) {
    newRecordButton.insertAdjacentHTML('beforebegin', paginationHtml);
  } else {
    toolbar.insertAdjacentHTML('beforeend', paginationHtml);
  }
  const select = document.querySelector('#ragicPageSizeSelect');
  select.value = String(RAGIC_STATE.pageSize);
  select.addEventListener('change', () => {
    RAGIC_STATE.pageSize = Number(select.value) || 50;
    RAGIC_STATE.page = 1;
    localStorage.setItem(ragicPageSizeKey(), String(RAGIC_STATE.pageSize));
    renderTable();
  });
  document.querySelector('#ragicPrevPage')?.addEventListener('click', () => { RAGIC_STATE.page -= 1; renderTable(); });
  document.querySelector('#ragicNextPage')?.addEventListener('click', () => { RAGIC_STATE.page += 1; renderTable(); });
};
const renderPagination = () => {
  ensurePagination();
  clampRagicPage();
  const totalPages = getTotalPages();
  const pageStatus = document.querySelector('#ragicPageStatus');
  if (pageStatus) pageStatus.textContent = `第 ${RAGIC_STATE.page}/${totalPages} 頁`;
  const select = document.querySelector('#ragicPageSizeSelect');
  if (select) select.value = String(RAGIC_STATE.pageSize);
  const prev = document.querySelector('#ragicPrevPage');
  const next = document.querySelector('#ragicNextPage');
  if (prev) prev.disabled = RAGIC_STATE.page <= 1;
  if (next) next.disabled = RAGIC_STATE.page >= totalPages;
};
const renderTable = () => {
  const tbody = document.querySelector('#ragicTableBody');
  tbody.innerHTML = '';
  const fields = listFields();
  clampRagicPage();
  const start = (RAGIC_STATE.page - 1) * RAGIC_STATE.pageSize;
  RAGIC_STATE.filtered.slice(start, start + RAGIC_STATE.pageSize).forEach((record) => {
    const tr = document.createElement('tr');
    tr.tabIndex = canUse('edit') ? 0 : -1;
    tr.classList.toggle('is-readonly', !canUse('edit'));
    tr.innerHTML = renderIconActions(record) + fields.map((field) => {
      const columnClass = ragicColumnClass(field);
      const title = columnClass === 'col-content' ? ` title="${escapeHtml(cellTooltipText(record, field))}"` : '';
      const width = fieldColumnWidth(field);
      const style = width ? ` style="width: ${width}px;"` : '';
      return `<td class="${columnClass}" data-doc-id="${escapeHtml(record.id)}" data-field-key="${escapeHtml(field.key)}"${style}${title}>${renderCell(record, field)}</td>`;
    }).join('');
    if (canUse('edit')) tr.addEventListener('dblclick', () => renderForm(record));
    tbody.appendChild(tr);
  });
  renderPagination();
};
const sortValue = (record, fieldKey) => {
  const field = getFields().find((item) => item.key === fieldKey);
  const raw = record[fieldKey];
  if (['date', 'datetime', 'createdDate', 'updatedDate'].includes(field?.type)) {
    const text = valueToText(raw).toString().trim();
    const parsed = raw?.toDate ? raw.toDate().getTime() : Date.parse(text.replace(/\//g, '-'));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return valueToText(raw).toString();
};

const compareRecords = (a, b, fieldKey, direction) => {
  const first = sortValue(a, fieldKey);
  const second = sortValue(b, fieldKey);
  const result = typeof first === 'number' && typeof second === 'number'
    ? first - second
    : String(first).localeCompare(String(second), 'zh-Hant', { numeric: true });
  return result * (direction === 'asc' ? 1 : -1);
};

const renderFilteredList = (filtered) => {
  RAGIC_STATE.filtered = [...filtered];
  if (RAGIC_STATE.sortKey) RAGIC_STATE.filtered.sort((a, b) => compareRecords(a, b, RAGIC_STATE.sortKey, RAGIC_STATE.sortDir));
  RAGIC_STATE.page = 1;
  renderTable();
};

const updateColumnMenuStates = () => {
  document.querySelectorAll('.col-menu-trigger').forEach((trigger) => {
    const key = trigger.dataset.field;
    const hasFilter = Boolean(RAGIC_STATE.filters[key]);
    const isSorted = RAGIC_STATE.sortKey === key;
    trigger.classList.toggle('is-active', hasFilter || isSorted);
    const indicator = trigger.parentElement?.querySelector('.col-sort-indicator');
    if (indicator) indicator.textContent = isSorted ? (RAGIC_STATE.sortDir === 'asc' ? '↑' : '↓') : '';
  });
};

const applyFilters = () => {
  const filters = Object.fromEntries(Object.entries(RAGIC_STATE.filters).map(([key, value]) => [key, String(value || '').trim().toLowerCase()]).filter(([, value]) => value));
  const filtered = RAGIC_STATE.records.filter((record) => Object.entries(filters).every(([fieldKey, keyword]) => {
    const value = valueToText(record[fieldKey]).toString().toLowerCase();
    return value.includes(keyword);
  }));
  renderFilteredList(filtered);
  updateColumnMenuStates();
};


const closeColumnMenus = (exceptKey = '') => {
  document.querySelectorAll('.col-menu-dropdown').forEach((menu) => {
    if (menu.dataset.menu !== exceptKey) menu.hidden = true;
  });
  RAGIC_STATE.openMenuKey = exceptKey;
};

const toggleColumnMenu = (key) => {
  const selectorKey = window.CSS?.escape ? CSS.escape(key) : String(key).replace(/"/g, '\\"');
  const menu = document.querySelector(`.col-menu-dropdown[data-menu="${selectorKey}"]`);
  if (!menu) return;
  const willOpen = menu.hidden;
  closeColumnMenus(willOpen ? key : '');
  menu.hidden = !willOpen;
  if (willOpen) menu.querySelector('[data-menu-filter]')?.focus();
};

const handleColumnMenuClick = (event) => {
  const trigger = event.target.closest('.col-menu-trigger');
  if (trigger) {
    event.preventDefault();
    event.stopPropagation();
    toggleColumnMenu(trigger.dataset.field);
    return;
  }
  const item = event.target.closest('[data-menu-action]');
  if (!item) return;
  event.preventDefault();
  event.stopPropagation();
  const key = item.dataset.field;
  const action = item.dataset.menuAction;
  if (action === 'filter') {
    const box = item.parentElement.querySelector('.col-filter-box');
    if (box) {
      box.hidden = false;
      box.querySelector('input')?.focus();
    }
    return;
  }
  if (action === 'clear-filter') {
    delete RAGIC_STATE.filters[key];
    const input = item.parentElement.querySelector('[data-menu-filter]');
    if (input) input.value = '';
  }
  if (action === 'sort-asc' || action === 'sort-desc') {
    RAGIC_STATE.sortKey = key;
    RAGIC_STATE.sortDir = action === 'sort-asc' ? 'asc' : 'desc';
  }
  if (action === 'clear-sort') {
    RAGIC_STATE.sortKey = '';
    RAGIC_STATE.sortDir = 'asc';
  }
  closeColumnMenus();
  applyFilters();
};

const handleColumnMenuInput = (event) => {
  const input = event.target.closest('[data-menu-filter]');
  if (!input) return;
  RAGIC_STATE.filters[input.dataset.menuFilter] = input.value;
  applyFilters();
};

const updateRagicStickyHeaderOffset = () => {
  const headerRow = document.querySelector('#ragicHeaderRow');
  const wrap = headerRow?.closest('.ragic-table-wrap');
  if (!headerRow || !wrap) return;
  requestAnimationFrame(() => {
    wrap.style.setProperty('--ragic-header-row-height', `${Math.ceil(headerRow.getBoundingClientRect().height || 42)}px`);
  });
};
const renderHeader = () => {
  const headerRow = document.querySelector('#ragicHeaderRow');
  const thead = headerRow?.closest('thead');
  const table = headerRow?.closest('table');
  if (table) table.style.tableLayout = 'fixed';
  document.querySelector('#ragicFilterRow')?.remove();
  headerRow.innerHTML = `<th class="icon-actions-head col-marker">標記</th>` + listFields().map((field) => {
    const key = escapeHtml(field.key);
    const label = escapeHtml(field.label || field.key);
    const width = fieldColumnWidth(field);
    const style = width ? ` style="width: ${width}px;"` : '';
    const filterValue = escapeHtml(RAGIC_STATE.filters[field.key] || '');
    return `<th class="${ragicColumnClass(field)} col-menu-cell"${style}><span class="col-label">${label}</span><span class="col-menu-trigger" data-field="${key}" role="button" tabindex="0" aria-label="開啟${label}欄位選單">▼</span><span class="col-sort-indicator"></span><div class="col-menu-dropdown" data-menu="${key}" hidden><div class="menu-item" data-menu-action="filter" data-field="${key}">🔍 <span>文字篩選</span></div><div class="col-filter-box" ${filterValue ? '' : 'hidden'}><input type="text" data-menu-filter="${key}" placeholder="輸入關鍵字..." value="${filterValue}" /></div><div class="menu-item" data-menu-action="clear-filter" data-field="${key}">✕ <span>清除篩選條件</span></div><div class="menu-divider"></div><div class="menu-item" data-menu-action="sort-asc" data-field="${key}">↑ <span>從A到Z排序</span></div><div class="menu-item" data-menu-action="sort-desc" data-field="${key}">↓ <span>從Z到A排序</span></div><div class="menu-item" data-menu-action="clear-sort" data-field="${key}">✕ <span>清除排序</span></div></div></th>`;
  }).join('');
  if (thead) thead.querySelectorAll('tr:not(#ragicHeaderRow)').forEach((row) => row.remove());
  updateColumnMenuStates();
  updateRagicStickyHeaderOffset();
};

const designerFieldRows = (container) => [...container.children].filter((el) => el.classList.contains('designer-field'));
const nextDesignerKey = (container, prefix = 'field') => {
  const usedKeys = new Set(designerFieldRows(container).map((row) => row.dataset.key).filter(Boolean));
  let index = usedKeys.size + 1;
  let key = `${prefix}_${index}`;
  while (usedKeys.has(key)) {
    index += 1;
    key = `${prefix}_${index}`;
  }
  return key;
};
let draggedDesignerField = null;
const moveDesignerField = (fromRow, toRow) => {
  if (!fromRow || !toRow || fromRow === toRow || fromRow.parentElement !== toRow.parentElement) return;
  const container = toRow.parentElement;
  const rows = designerFieldRows(container);
  const fromIndex = rows.indexOf(fromRow);
  const toIndex = rows.indexOf(toRow);
  if (fromIndex < 0 || toIndex < 0) return;
  if (fromIndex < toIndex) container.insertBefore(fromRow, toRow.nextSibling);
  else container.insertBefore(fromRow, toRow);
};
const enableDesignerDrag = (row) => {
  const handle = row.querySelector('.drag-handle');
  let handlePressed = false;
  row.setAttribute('draggable', 'true');
  handle.addEventListener('mousedown', () => { handlePressed = true; });
  handle.addEventListener('touchstart', () => { handlePressed = true; }, { passive: true });
  row.addEventListener('dragstart', function(e) {
    if (!handlePressed && !e.target.closest('.drag-handle')) {
      e.preventDefault();
      return;
    }
    draggedDesignerField = this;
    const index = designerFieldRows(this.parentElement).indexOf(this);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    this.classList.add('dragging');
  });
  row.addEventListener('dragover', function(e) {
    if (!draggedDesignerField || draggedDesignerField.parentElement !== this.parentElement) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
  });
  row.addEventListener('dragleave', function() {
    this.classList.remove('drag-over');
  });
  row.addEventListener('drop', function(e) {
    e.preventDefault();
    moveDesignerField(draggedDesignerField, this);
    this.classList.remove('drag-over');
    updateDesignerPreview();
  });
  row.addEventListener('dragend', function() {
    this.classList.remove('dragging');
    document.querySelectorAll('.designer-field.drag-over').forEach((item) => item.classList.remove('drag-over'));
    draggedDesignerField = null;
    handlePressed = false;
    updateDesignerPreview();
  });
};
const designerPreviewValue = (field = {}, rowIndex = 0) => {
  const options = optionList(field);
  const samples = ['範例文字', '第二筆範例', '第三筆範例'];
  if (field.type === 'date' || field.type === 'datetime' || field.type === 'createdDate' || field.type === 'updatedDate') return '2026/07/13';
  if (field.type === 'select' || field.type === 'multiselect') return options[0] || '選項一';
  if (field.type === 'image') return '🖼️';
  if (field.type === 'link') return 'https://example.com';
  if (field.type === 'serial') return `#${String(rowIndex + 1).padStart(3, '0')}`;
  if (field.type === 'file') return '附件.pdf';
  return samples[rowIndex] || samples[0];
};
const updateDesignerPreview = () => {
  const modal = document.querySelector('#ragicDesignerModal');
  const body = modal?.querySelector('.designer-body');
  const preview = modal?.querySelector('#designerPreviewTable');
  if (!body || !preview) return;
  const fields = readDesigner(body).filter((field) => field.type !== 'subtable');
  if (!fields.length) {
    preview.innerHTML = '<div class="designer-preview-empty">尚未建立欄位，請新增欄位以預覽表格。</div>';
    return;
  }
  const colgroup = fields.map((field) => {
    const width = fieldColumnWidth(field);
    return `<col${width ? ` style="width: ${width}px;"` : ''}>`;
  }).join('');
  const headers = fields.map((field) => `<th class="${ragicColumnClass(field)}">${escapeHtml(field.label || field.key)}</th>`).join('');
  const rows = [0, 1, 2].map((rowIndex) => `<tr>${fields.map((field) => `<td class="${ragicColumnClass(field)}">${escapeHtml(designerPreviewValue(field, rowIndex))}</td>`).join('')}</tr>`).join('');
  preview.innerHTML = `<table class="ragic-table">${colgroup ? `<colgroup>${colgroup}</colgroup>` : ''}<thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
};
const SUBFIELD_TYPES = [
  { value: 'text', label: '文字' },
  { value: 'textarea', label: '多行文字' },
  { value: 'date', label: '日期' },
  { value: 'image', label: '圖片' },
  { value: 'file', label: '檔案' }
];

const fieldDesigner = (field = {}, nested = false) => {
  const row = document.createElement('div');
  row.className = `designer-field field-row${nested ? ' designer-subfield-row' : ''}`;
  row.dataset.key = shouldRegenerateFieldKey(field.key) ? generateFieldKey() : field.key;

  if (nested) {
    const subfieldType = SUBFIELD_TYPES.some((type) => type.value === field.type) ? field.type : 'text';
    const typeOptions = SUBFIELD_TYPES.map((type) => `<option value="${type.value}" ${subfieldType === type.value ? 'selected' : ''}>${type.label}</option>`).join('');
    row.innerHTML = `<span class="drag-handle" title="拖拉排序" aria-label="拖拉排序">⠿</span><input data-role="label" placeholder="子欄位名稱" value="${escapeHtml(field.label || '')}"><select data-role="type">${typeOptions}</select><label class="designer-width"><span>寬度</span><input data-role="width" type="number" min="1" step="1" inputmode="numeric" placeholder="自動" value="${escapeHtml(normalizeFieldWidth(field.width) ?? '')}"><span>px</span></label><div class="designer-actions"><button class="ghost danger" data-remove type="button">刪除</button></div>`;
    row.addEventListener('click', (event) => {
      if (event.target.matches('[data-remove]')) {
        event.stopPropagation();
        row.remove();
        updateDesignerPreview();
      }
    });
    enableDesignerDrag(row);
    return row;
  }
  
  const typeOptions = FIELD_TYPE_GROUPS.map((group) => {
    const options = group.types.map((type) => `<option value="${type.value}" ${field.type === type.value ? 'selected' : ''}>${type.label}</option>`).join('');
    return options ? `<optgroup label="${escapeHtml(group.label)}">${options}</optgroup>` : '';
  }).join('');
  const legacy = LEGACY_FIELD_TYPES.some((type) => type.value === field.type) ? `<optgroup label="舊類型（僅既有欄位）">${LEGACY_FIELD_TYPES.map((type) => `<option value="${type.value}" ${field.type === type.value ? 'selected' : ''}>${type.label}</option>`).join('')}</optgroup>` : '';
  row.innerHTML = `<span class="drag-handle" title="拖拉排序" aria-label="拖拉排序">⠿</span><input data-role="label" placeholder="欄位名稱" value="${escapeHtml(field.label || '')}"><select data-role="type">${typeOptions}${legacy}</select><textarea data-role="options" placeholder="選項，每行一個">${escapeHtml(optionList(field).join('\n'))}</textarea><label class="designer-required"><input data-role="required" type="checkbox" ${field.required ? 'checked' : ''}> 必填</label><label class="designer-width"><span>寬度</span><input data-role="width" type="number" min="1" step="1" inputmode="numeric" placeholder="自動" value="${escapeHtml(normalizeFieldWidth(field.width) ?? '')}"><span>px</span></label><div class="designer-actions"><button class="ghost danger" data-remove type="button">刪除</button></div><div class="designer-subfields"><h4>子欄位設定</h4><div class="designer-subfield-list"></div><button class="secondary" data-add-subfield type="button">+ 新增子欄位</button></div>`;
  const sub = row.querySelector('.designer-subfields');
  const subList = row.querySelector('.designer-subfield-list');
  const sync = () => { sub.hidden = row.querySelector('[data-role="type"]').value !== 'subtable'; };
  (field.fields || []).forEach((child) => subList.appendChild(fieldDesigner(child, true)));
  row.addEventListener('click', (event) => {
    if (event.target.matches('[data-remove]') && event.target.closest('.designer-field') === row) {
      row.remove();
      updateDesignerPreview();
    }
    if (event.target.matches('[data-add-subfield]')) {
      event.stopPropagation();
      subList.appendChild(fieldDesigner({ key: generateFieldKey(), label: '新子欄位', type: 'text' }, true));
      updateDesignerPreview();
    }
  });
  row.querySelector('[data-role="type"]').addEventListener('change', () => {
    sync();
    updateDesignerPreview();
  });
  enableDesignerDrag(row);
  sync();
  return row;
};
const readDesigner = (container) => [...container.children].filter((el) => el.classList.contains('designer-field')).map((row) => {
  const label = row.querySelector('[data-role="label"]').value.trim() || '未命名欄位';
  const type = row.querySelector('[data-role="type"]').value;
  const field = {
    key: shouldRegenerateFieldKey(row.dataset.key) ? generateFieldKey() : row.dataset.key,
    label,
    type,
    required: Boolean(row.querySelector('[data-role="required"]')?.checked),
    width: normalizeFieldWidth(row.querySelector('[data-role="width"]')?.value),
    options: (row.querySelector('[data-role="options"]')?.value || '').split('\n').map((v) => v.trim()).filter(Boolean)
  };
  if (type === 'subtable') field.fields = readDesigner(row.querySelector('.designer-subfield-list'));
  return field;
});

const openDesigner = async () => { const modal = document.querySelector('#ragicDesignerModal'); const body = modal.querySelector('.designer-body'); body.innerHTML = ''; getFields().forEach((field) => body.appendChild(fieldDesigner(field))); modal.hidden = false; updateDesignerPreview(); };
const closeDesigner = () => { document.querySelector('#ragicDesignerModal').hidden = true; };


const waitForPermissions = async () => {
  if (window.permissionReady) await window.permissionReady;
};

const applyRagicPermissionUi = () => {
  document.querySelector('#newRecordButton')?.toggleAttribute('hidden', !canUse('edit'));
  const saveButton = document.querySelector('button[form="ragicForm"][type="submit"]');
  if (saveButton) {
    saveButton.hidden = !canUse('edit');
    saveButton.disabled = !canUse('edit');
  }
  const deleteButton = document.querySelector('#deleteButton');
  if (deleteButton) deleteButton.hidden = !canUse('delete') || !RAGIC_STATE.currentId;
  const designButton = document.querySelector('#designTableButton');
  if (designButton) designButton.hidden = !canUse('design');
};

const setFormEditable = (form) => {
  const editable = canUse('edit');
  form.querySelectorAll('input, textarea, select').forEach((control) => {
    control.disabled = !editable || control.readOnly;
  });
  form.querySelectorAll('.ragic-multi-select').forEach((control) => {
    control.classList.toggle('is-disabled', !editable);
    control.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => { checkbox.disabled = !editable; });
  });
  form.querySelectorAll('.ragic-subtable-head button, .subtable-row .danger').forEach((button) => {
    button.hidden = !editable;
    button.disabled = !editable;
  });
};
const ensureTopbarActions = () => {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return null;
  let actions = topbar.querySelector('.topbar-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'topbar-actions';
    topbar.appendChild(actions);
  }
  const userPill = topbar.querySelector(':scope > .user-pill');
  if (userPill) actions.appendChild(userPill);
  return actions;
};


const serialPrefix = () => SERIAL_PREFIX_MAP[RAGIC_STATE.config?.collection] || `${String(RAGIC_STATE.config?.collection || 'DOC').toUpperCase().replace(/[^A-Z0-9]/g, '_')}-`;
const getNextSerial = async (collection, fieldKey) => {
  const records = RAGIC_STATE.records.length ? RAGIC_STATE.records : (collection ? (await collection.get()).docs.map((doc) => doc.data()) : []);
  const max = records.reduce((highest, record) => {
    const match = String(record[fieldKey] || record.serial || '').match(/(\d+)$/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return `${serialPrefix()}${String(max + 1).padStart(6, '0')}`;
};

const applySystemFieldValues = async (data, existingData = {}, collection = null) => {
  for (const field of getFields()) {
    if (field.type === 'createdDate') data[field.key] = existingData[field.key] || formatLocalDateTime();
    if (field.type === 'updatedDate') data[field.key] = formatLocalDateTime();
    if (field.type === 'serial') data[field.key] = existingData[field.key] || await getNextSerial(collection, field.key);
  }
  return data;
};

const setupRagicFormActions = () => {
  const deleteButton = document.querySelector('#deleteButton');
  const cancelButton = document.querySelector('#backToListButton');
  const saveButton = document.querySelector('button[form="ragicForm"][type="submit"]');
  const actions = deleteButton?.parentElement || saveButton?.parentElement;
  if (!actions) return;
  actions.classList.add('ragic-form-actions');
  if (deleteButton) {
    deleteButton.className = 'btn-danger';
    deleteButton.type = 'button';
    actions.appendChild(deleteButton);
  }
  if (cancelButton) {
    cancelButton.className = 'btn-secondary';
    cancelButton.type = 'button';
    cancelButton.textContent = '取消';
    actions.appendChild(cancelButton);
  }
  if (saveButton) {
    saveButton.className = 'btn-primary';
    actions.appendChild(saveButton);
  }
};
const initRagicPage = async (config) => {
  await waitForPermissions();
  RAGIC_STATE.config = { ...config, collection: dataCollectionName(config), schemaCollection: schemaCollectionName(config) }; RAGIC_STATE.pageSize = Number(localStorage.getItem(ragicPageSizeKey())) || 50; const db = window.omniplayDb; const collection = db?.collection(RAGIC_STATE.config.collection); RAGIC_STATE.collection = collection; const schemaDoc = db?.collection(RAGIC_STATE.config.schemaCollection).doc('active');
  window.toggleFire = async (docId) => { const doc = await collection.doc(docId).get(); await collection.doc(docId).update({ fire: !doc.data()?.fire }); };
  window.togglePin = async (docId) => {
    const currentUser = currentRagicUser();
    if (!currentUser) return alert('請先登入再使用個人釘選');
    const doc = await collection.doc(docId).get();
    await collection.doc(docId).update({ [`pins.${currentUser}`]: !doc.data()?.pins?.[currentUser] });
  };
  document.querySelector('#ragicTitle').textContent = config.title; document.querySelector('#ragicSubtitle').textContent = `${config.title}列表、動態表單與表格設計維護`;
  const topbarActions = ensureTopbarActions();
  const newRecordButton = document.querySelector('#newRecordButton');
  const designButton = document.querySelector('#designTableButton');
  if (topbarActions && canUse('design')) {
    const button = designButton || document.createElement('button');
    const userPill = topbarActions.querySelector('.user-pill');
    button.className = 'secondary';
    button.id = 'designTableButton';
    button.type = 'button';
    button.textContent = '⚙️ 設計表格';
    if (!button.parentElement) topbarActions.insertBefore(button, userPill || null);
  } else {
    designButton?.remove();
  }
  if (!document.querySelector('#ragicDesignerModal')) {
  document.querySelector('body').insertAdjacentHTML('beforeend', '<div class="ragic-modal" id="ragicDesignerModal" hidden><div class="ragic-modal-card"><div class="ragic-form-toolbar"><h2>設計表格</h2><button class="ghost" id="closeDesignerButton" type="button">關閉</button></div><div class="designer-body"></div><section class="designer-preview" aria-label="表格預覽"><h3>📋 表格預覽</h3><div class="designer-preview-scroll" id="designerPreviewTable"></div></section><div class="ragic-actions"><button class="secondary" id="addFieldButton" type="button">+ 新增欄位</button><button class="primary" id="saveSchemaButton" type="button">儲存設計</button></div></div></div>');
  }
  if (!document.querySelector('#ragicImageModal')) {
    document.querySelector('body').insertAdjacentHTML('beforeend', '<div class="ragic-modal" id="ragicImageModal" hidden><div class="ragic-modal-card ragic-image-modal-card"><div class="ragic-form-toolbar"><h2>圖片</h2><button class="ghost" id="closeImageModalButton" type="button">關閉</button></div><img alt="放大圖片預覽"></div></div>');
  }
  document.querySelector('#designTableButton')?.addEventListener('click', openDesigner);
  document.querySelector('#closeDesignerButton')?.addEventListener('click', closeDesigner);
  document.querySelector('#closeImageModalButton')?.addEventListener('click', closeImagePreview);
  document.querySelector('#ragicImageModal')?.addEventListener('click', (event) => { if (event.target.id === 'ragicImageModal') closeImagePreview(); });
  document.querySelector('.designer-body')?.addEventListener('input', updateDesignerPreview);
  document.querySelector('.designer-body')?.addEventListener('change', updateDesignerPreview);
  document.querySelector('#addFieldButton')?.addEventListener('click', () => { const body = document.querySelector('.designer-body'); body.appendChild(fieldDesigner({ key: generateFieldKey(), label: '新欄位', type: 'text' })); updateDesignerPreview(); });  
  document.querySelector('#saveSchemaButton')?.addEventListener('click', async () => {
    if (!canUse('design')) return alert('您沒有設計權限');
    RAGIC_STATE.schema = { ...normalizeSchema({ fields: readDesigner(document.querySelector('.designer-body')) }), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (schemaDoc) await schemaDoc.set(RAGIC_STATE.schema, { merge: true });
    closeDesigner();
    renderHeader();
    applyFilters();
  });
  setupRagicFormActions();
  applyRagicPermissionUi(); document.querySelector('#newRecordButton').addEventListener('click', () => { if (canUse('edit')) renderForm(); }); document.querySelector('#backToListButton').addEventListener('click', () => { document.querySelector('#ragicFormView').hidden = true; document.querySelector('#ragicListView').hidden = false; });
  document.querySelector('#deleteButton').addEventListener('click', async () => { if (!canUse('delete')) return alert('您沒有刪除權限'); if (!RAGIC_STATE.currentId || !confirm('確定刪除此筆資料？\n資料將不再存在🚫')) return; await collection.doc(RAGIC_STATE.currentId).delete(); document.querySelector('#backToListButton').click(); });
  document.querySelector('#ragicForm').addEventListener('submit', async (event) => {
  event.preventDefault();
    const fields = getFields();
    if (!fields.length) {
      alert('表格結構尚未載入，請稍後再試');
      return;
    }
    if (!canUse('edit')) return alert('您沒有編輯權限');
    const saveButton = document.querySelector('button[form="ragicForm"][type="submit"]');
    const originalText = saveButton?.textContent || '儲存';
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = '儲存中...'; }
    try {
      const existingRecord = RAGIC_STATE.currentId ? RAGIC_STATE.records.find((record) => record.id === RAGIC_STATE.currentId) || {} : {};
      const data = await applySystemFieldValues(await getFormData(), existingRecord, collection);
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      if (RAGIC_STATE.currentId) {
        if (!existingRecord?.createdAt) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await collection.doc(RAGIC_STATE.currentId).set(data, { merge: true });
      } else await collection.add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      document.querySelector('#backToListButton').click();
    } catch (error) {
      console.error(error);
      alert(error.message || '儲存失敗，請稍後再試。');
    } finally {
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = originalText; }
    }
  });
  const ragicTableHead = document.querySelector('#ragicHeaderRow')?.closest('thead');
  window.addEventListener('resize', updateRagicStickyHeaderOffset);
  ragicTableHead?.addEventListener('input', handleColumnMenuInput);
  ragicTableHead?.addEventListener('click', handleColumnMenuClick);
  ragicTableHead?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const trigger = event.target.closest('.col-menu-trigger');
    if (!trigger) return;
    event.preventDefault();
    toggleColumnMenu(trigger.dataset.field);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.col-menu-cell')) closeColumnMenus();
  });
  document.querySelector('#ragicTableBody').addEventListener('click', (event) => { const thumbnail = event.target.closest('.ragic-thumbnail'); if (thumbnail) { event.preventDefault(); event.stopPropagation(); openImagePreview(thumbnail.src, thumbnail.alt || '圖片'); return; } const link = event.target.closest('a'); if (link) { event.stopPropagation(); return; } const button = event.target.closest('[data-icon-action]'); if (button) { event.preventDefault(); event.stopPropagation(); const id = button.dataset.docId; if (button.dataset.iconAction === 'fire') window.toggleFire(id); if (button.dataset.iconAction === 'pin') window.togglePin(id); return; } const cell = event.target.closest('td[data-doc-id][data-field-key]'); if (cell) { event.preventDefault(); event.stopPropagation(); startInlineEdit(cell); } });
  document.querySelector('#ragicTableBody').addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key)) return; const link = event.target.closest('a'); if (link) { event.stopPropagation(); return; } const button = event.target.closest('[data-icon-action]'); if (!button) return; event.preventDefault(); button.click(); });
  if (!collection || !schemaDoc) { RAGIC_STATE.schema = makeDefaultSchema(config); renderHeader(); return; }
  schemaDoc.onSnapshot(async (doc) => {
    if (!doc.exists) await schemaDoc.set(makeDefaultSchema(config), { merge: true });
    const loadedSchema = doc.exists ? doc.data() : makeDefaultSchema(config);
    if (doc.exists && fixDuplicateKeys(loadedSchema.fields || [])) {
      await schemaDoc.set({ ...loadedSchema, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    RAGIC_STATE.schema = normalizeSchema(loadedSchema);
    renderHeader();
    applyRagicPermissionUi();
    applyFilters();
  });
  collection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => { RAGIC_STATE.records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); applyRagicPermissionUi(); applyFilters(); });
};
