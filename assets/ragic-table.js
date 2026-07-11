const RAGIC_STATE = { records: [], filtered: [], currentId: null, sortKey: '', sortDir: 'asc', config: null, schema: null, unsubscribeRecords: null };

const FIELD_TYPES = [
  { value: 'text', label: '文字' }, { value: 'textarea', label: '多行文字' }, { value: 'number', label: '數字' },
  { value: 'date', label: '日期' }, { value: 'time', label: '時間' }, { value: 'select', label: '下拉選單' }, { value: 'multiselect', label: '多選' },
  { value: 'file', label: '圖片上傳' }, { value: 'person', label: '人員選擇' }, { value: 'subtable', label: '子表格' }
];

const COLLECTION_MAP = { workHandover: 'handover', workLogs: 'log', workReports: 'report', workTracking: 'tracking', workAlerts: 'alert', meetingRecords: 'meeting', knowledgeBase: 'knowledge', aiDatabase: 'ai_database' };
const SCHEMA_MAP = { handover: 'handover_schema', log: 'log_schema', report: 'report_schema', tracking: 'tracking_schema', alert: 'alert_schema', meeting: 'meeting_schema', knowledge: 'knowledge_schema', ai_database: 'ai_database_schema' };

const normalizeKey = (text, fallback = 'field') => String(text || fallback).trim().replace(/[^\w\u4e00-\u9fa5]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || `${fallback}_${Date.now()}`;
const valueToText = (value) => Array.isArray(value) ? value.join('、') : (value?.toDate ? value.toDate().toLocaleString('zh-TW') : (value ?? ''));
const today = () => new Date().toISOString().slice(0, 10);
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
const MAX_IMAGE_WIDTH = 800;
const JPEG_QUALITY = 0.6;
const MAX_IMAGE_BYTES = 900 * 1024;

const makeDefaultSchema = (config) => normalizeSchema({
  fields: [...(config.fields || []), ...(config.subtable ? [{ ...config.subtable, type: 'subtable', fields: config.subtable.fields || [] }] : [])]
});

const createControl = (field, value = '', subfield = false) => {
  let input;
  if (field.type === 'textarea') { input = document.createElement('textarea'); input.rows = field.rows || 4; }
  else if (field.type === 'select' || field.type === 'multiselect') {
    input = document.createElement('select'); if (field.type === 'multiselect') input.multiple = true;
    optionList(field).forEach((option) => { const opt = document.createElement('option'); opt.value = option; opt.textContent = option; input.appendChild(opt); });
  } else { input = document.createElement('input'); input.type = field.type === 'person' ? 'text' : (field.type || 'text'); if (field.type === 'file') input.accept = 'image/*'; }
  input.name = subfield ? '' : field.key; input.required = field.type === 'file' ? false : Boolean(field.required); input.placeholder = field.type === 'person' ? '輸入或選擇人員' : (field.placeholder || '');
  if (subfield) input.dataset.subfield = field.key;
  if (field.type === 'multiselect') { const selected = Array.isArray(value) ? value : String(value || '').split(',').map((item) => item.trim()); [...input.options].forEach((option) => { option.selected = selected.includes(option.value); }); }
  else if (field.type !== 'file') input.value = value || field.defaultValue || (field.type === 'date' && !subfield ? today() : '');
  return input;
};

const createField = (field, value = '') => {
  const wrap = document.createElement('label'); wrap.className = `ragic-field ragic-field-${field.type || 'text'}`; wrap.innerHTML = `<span>${field.label}${field.required ? ' *' : ''}</span>`;
  wrap.appendChild(createControl(field, value));
  if (field.type === 'file' && value) {
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'ragic-file-preview';
    preview.innerHTML = `<img src="${escapeHtml(value)}" alt="${escapeHtml(field.label)}預覽"><span>點擊放大檢視</span>`;
    preview.addEventListener('click', () => openImagePreview(value, field.label));
    wrap.appendChild(preview);
  }
  return wrap;
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
  if (size > MAX_IMAGE_BYTES) throw new Error('圖片太大，請選擇較小的圖片');
  return dataUrl;
};

const getFormData = async () => {
  const data = {};
  for (const field of getFields()) {
    if (field.type === 'subtable') {
      data[field.key] = [...document.querySelectorAll(`[data-subtable="${field.key}"] .subtable-row`)].map((row) => {
        const item = {}; (field.fields || []).forEach((sub) => { const control = row.querySelector(`[data-subfield="${sub.key}"]`); item[sub.key] = sub.type === 'multiselect' ? [...control.selectedOptions].map((opt) => opt.value) : (control?.value?.trim() || ''); }); return item;
      }).filter((item) => Object.values(item).some((value) => Array.isArray(value) ? value.length : value));
      continue;
    }
    const input = document.querySelector(`[name="${field.key}"]`); if (!input) continue;
    if (field.type === 'multiselect') data[field.key] = [...input.selectedOptions].map((opt) => opt.value);
    else if (field.type === 'file') data[field.key] = input.files?.[0] ? await compressImageToBase64(input.files[0]) : (RAGIC_STATE.records.find((r) => r.id === RAGIC_STATE.currentId)?.[field.key] || '');
    else data[field.key] = input.value.trim();
  }
  return data;
};

const renderSubtableRow = (field, item = {}) => {
  const row = document.createElement('tr'); row.className = 'subtable-row';
  (field.fields || []).forEach((sub) => { const td = document.createElement('td'); td.appendChild(createControl(sub, item[sub.key], true)); row.appendChild(td); });
  const action = document.createElement('td'); action.innerHTML = '<button class="ghost danger" type="button">刪除</button>'; action.querySelector('button').addEventListener('click', () => row.remove()); row.appendChild(action); return row;
};

const renderForm = (record = {}) => {
  RAGIC_STATE.currentId = record.id || null; document.querySelector('#ragicListView').hidden = true; const formView = document.querySelector('#ragicFormView'); formView.hidden = false;
  formView.querySelector('h2').textContent = record.id ? `編輯${RAGIC_STATE.config.title}` : `新增${RAGIC_STATE.config.title}`; const form = formView.querySelector('form'); form.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'ragic-form-grid';
  getFields().filter((field) => field.type !== 'subtable').forEach((field) => grid.appendChild(createField(field, record[field.key]))); form.appendChild(grid);
  getFields().filter((field) => field.type === 'subtable').forEach((field) => { const section = document.createElement('section'); section.className = 'ragic-subtable'; section.dataset.subtable = field.key; section.innerHTML = `<div class="ragic-subtable-head"><h3>${field.label}</h3><button class="secondary" type="button">+ 新增明細</button></div><div class="ragic-table-wrap"><table><thead><tr>${(field.fields || []).map((f) => `<th>${f.label}</th>`).join('')}<th>操作</th></tr></thead><tbody></tbody></table></div>`; const body = section.querySelector('tbody'); ((record[field.key]?.length ? record[field.key] : [{}])).forEach((item) => body.appendChild(renderSubtableRow(field, item))); section.querySelector('button').addEventListener('click', () => { if (canUse('edit')) body.appendChild(renderSubtableRow(field)); }); form.appendChild(section); });
  setFormEditable(form);
  applyRagicPermissionUi();
};

const renderCell = (record, field) => {
  const key = field.key;
  const value = record[key];
  if (field?.type === 'file') return value ? `<img class="ragic-thumbnail" src="${escapeHtml(value)}" alt="${escapeHtml(field.label)}縮圖">` : '';
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
const renderTable = () => { const tbody = document.querySelector('#ragicTableBody'); tbody.innerHTML = ''; const fields = listFields(); RAGIC_STATE.filtered.forEach((record) => { const tr = document.createElement('tr'); tr.tabIndex = canUse('edit') ? 0 : -1; tr.classList.toggle('is-readonly', !canUse('edit')); tr.innerHTML = fields.map((field) => `<td>${renderCell(record, field)}</td>`).join(''); if (canUse('edit')) tr.addEventListener('click', () => renderForm(record)); tbody.appendChild(tr); }); };
const applyFilters = () => { const cols = listColumns(); RAGIC_STATE.filtered = RAGIC_STATE.records.filter((record) => cols.every((key) => { const filter = document.querySelector(`[data-filter="${key}"]`)?.value.toLowerCase() || ''; return !filter || valueToText(record[key]).toLowerCase().includes(filter); })); if (RAGIC_STATE.sortKey) RAGIC_STATE.filtered.sort((a, b) => valueToText(a[RAGIC_STATE.sortKey]).localeCompare(valueToText(b[RAGIC_STATE.sortKey]), 'zh-Hant') * (RAGIC_STATE.sortDir === 'asc' ? 1 : -1)); renderTable(); };
const renderHeader = () => {
  const headerRow = document.querySelector('#ragicHeaderRow');
  headerRow.innerHTML = listFields().map((field) => {
    const key = escapeHtml(field.key);
    const label = escapeHtml(field.label || field.key);
    return `<th><button class="sort-btn" type="button" data-sort="${key}">${label} ⇅</button><input data-filter="${key}" placeholder="篩選${label}" /></th>`;
  }).join('');
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
const fieldDesigner = (field = {}, nested = false) => {
  const row = document.createElement('div');
  row.className = 'designer-field';
  row.innerHTML = `<input data-role="label" placeholder="欄位名稱" value="${escapeHtml(field.label || '')}"><select data-role="type">${FIELD_TYPES.filter((type) => !nested || type.value !== 'subtable').map((type) => `<option value="${type.value}" ${field.type === type.value ? 'selected' : ''}>${type.label}</option>`).join('')}</select><textarea data-role="options" placeholder="選項，每行一個">${escapeHtml(optionList(field).join('\n'))}</textarea><label class="designer-required"><input data-role="required" type="checkbox" ${field.required ? 'checked' : ''}> 必填</label><div class="designer-actions"><button class="secondary" data-move="up" type="button">↑</button><button class="secondary" data-move="down" type="button">↓</button><button class="ghost danger" data-remove type="button">刪除</button></div><div class="designer-subfields"></div>`;
  row.dataset.key = shouldRegenerateFieldKey(field.key) ? generateFieldKey() : field.key;
  const sub = row.querySelector('.designer-subfields');
  const sync = () => { sub.hidden = row.querySelector('[data-role="type"]').value !== 'subtable'; };
  (field.fields || []).forEach((child) => sub.appendChild(fieldDesigner(child, true)));
  sub.insertAdjacentHTML('afterbegin', '<button class="secondary" data-add-subfield type="button">+ 子欄位</button>');
  row.addEventListener('click', (event) => {
    if (event.target.matches('[data-remove]')) row.remove();
    if (event.target.matches('[data-move="up"]') && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
    if (event.target.matches('[data-move="down"]') && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
    if (event.target.matches('[data-add-subfield]')) sub.appendChild(fieldDesigner({ key: generateFieldKey(), label: '新子欄位', type: 'text' }, true));
  });
  row.querySelector('[data-role="type"]').addEventListener('change', sync);
  sync();
  return row;
};
const readDesigner = (container) => [...container.children].filter((el) => el.classList.contains('designer-field')).map((row) => { const label = row.querySelector('[data-role="label"]').value.trim() || '未命名欄位'; const type = row.querySelector('[data-role="type"]').value; const field = { key: shouldRegenerateFieldKey(row.dataset.key) ? generateFieldKey() : row.dataset.key, label, type, required: row.querySelector('[data-role="required"]').checked, options: row.querySelector('[data-role="options"]').value.split('\n').map((v) => v.trim()).filter(Boolean) }; if (type === 'subtable') field.fields = readDesigner(row.querySelector('.designer-subfields')); return field; });

const openDesigner = async () => { const modal = document.querySelector('#ragicDesignerModal'); const body = modal.querySelector('.designer-body'); body.innerHTML = ''; getFields().forEach((field) => body.appendChild(fieldDesigner(field))); modal.hidden = false; };
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
    control.disabled = !editable;
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

const initRagicPage = async (config) => {
  await waitForPermissions();
  RAGIC_STATE.config = { ...config, collection: dataCollectionName(config), schemaCollection: schemaCollectionName(config) }; const db = window.omniplayDb; const collection = db?.collection(RAGIC_STATE.config.collection); const schemaDoc = db?.collection(RAGIC_STATE.config.schemaCollection).doc('active');
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
  document.querySelector('body').insertAdjacentHTML('beforeend', '<div class="ragic-modal" id="ragicDesignerModal" hidden><div class="ragic-modal-card"><div class="ragic-form-toolbar"><h2>設計表格</h2><button class="ghost" id="closeDesignerButton" type="button">關閉</button></div><div class="designer-body"></div><div class="ragic-actions"><button class="secondary" id="addFieldButton" type="button">+ 新增欄位</button><button class="primary" id="saveSchemaButton" type="button">儲存設計</button></div></div></div>');
  }
  if (!document.querySelector('#ragicImageModal')) {
    document.querySelector('body').insertAdjacentHTML('beforeend', '<div class="ragic-modal" id="ragicImageModal" hidden><div class="ragic-modal-card ragic-image-modal-card"><div class="ragic-form-toolbar"><h2>圖片</h2><button class="ghost" id="closeImageModalButton" type="button">關閉</button></div><img alt="放大圖片預覽"></div></div>');
  }
  document.querySelector('#designTableButton')?.addEventListener('click', openDesigner);
  document.querySelector('#closeDesignerButton')?.addEventListener('click', closeDesigner);
  document.querySelector('#closeImageModalButton')?.addEventListener('click', closeImagePreview);
  document.querySelector('#ragicImageModal')?.addEventListener('click', (event) => { if (event.target.id === 'ragicImageModal') closeImagePreview(); });
  document.querySelector('#addFieldButton')?.addEventListener('click', () => { const body = document.querySelector('.designer-body'); body.appendChild(fieldDesigner({ key: generateFieldKey(), label: '新欄位', type: 'text' })); });  
  document.querySelector('#saveSchemaButton')?.addEventListener('click', async () => {
    if (!canUse('design')) return alert('您沒有設計權限');
    RAGIC_STATE.schema = { ...normalizeSchema({ fields: readDesigner(document.querySelector('.designer-body')) }), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (schemaDoc) await schemaDoc.set(RAGIC_STATE.schema, { merge: true });
    closeDesigner();
    renderHeader();
    applyFilters();
  });
  applyRagicPermissionUi(); document.querySelector('#newRecordButton').addEventListener('click', () => { if (canUse('edit')) renderForm(); }); document.querySelector('#backToListButton').addEventListener('click', () => { document.querySelector('#ragicFormView').hidden = true; document.querySelector('#ragicListView').hidden = false; });
  document.querySelector('#deleteButton').addEventListener('click', async () => { if (!canUse('delete')) return alert('您沒有刪除權限'); if (!RAGIC_STATE.currentId || !confirm('確定刪除此筆資料？')) return; await collection.doc(RAGIC_STATE.currentId).delete(); document.querySelector('#backToListButton').click(); });
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
      const data = await getFormData();
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      if (RAGIC_STATE.currentId) {
        const existingRecord = RAGIC_STATE.records.find((record) => record.id === RAGIC_STATE.currentId);
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
  document.querySelector('#ragicHeaderRow').addEventListener('input', applyFilters); document.querySelector('#ragicHeaderRow').addEventListener('click', (event) => { const key = event.target.closest('[data-sort]')?.dataset.sort; if (!key) return; RAGIC_STATE.sortDir = RAGIC_STATE.sortKey === key && RAGIC_STATE.sortDir === 'asc' ? 'desc' : 'asc'; RAGIC_STATE.sortKey = key; applyFilters(); });
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
