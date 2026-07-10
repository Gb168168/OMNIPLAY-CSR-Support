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
const getFields = () => RAGIC_STATE.schema?.fields || [];
const listColumns = () => getFields().filter((field) => field.type !== 'subtable').map((field) => field.key);
const optionList = (field) => Array.isArray(field.options) ? field.options : String(field.options || '').split('\n').map((item) => item.trim()).filter(Boolean);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

const makeDefaultSchema = (config) => ({
  fields: [...(config.fields || []), ...(config.subtable ? [{ ...config.subtable, type: 'subtable', fields: config.subtable.fields || [] }] : [])]
    .map((field) => ({ ...field, key: field.key || normalizeKey(field.label), options: optionList(field), fields: (field.fields || []).map((sub) => ({ ...sub, key: sub.key || normalizeKey(sub.label), options: optionList(sub) })) }))
});

const createControl = (field, value = '', subfield = false) => {
  let input;
  if (field.type === 'textarea') { input = document.createElement('textarea'); input.rows = field.rows || 4; }
  else if (field.type === 'select' || field.type === 'multiselect') {
    input = document.createElement('select'); if (field.type === 'multiselect') input.multiple = true;
    optionList(field).forEach((option) => { const opt = document.createElement('option'); opt.value = option; opt.textContent = option; input.appendChild(opt); });
  } else { input = document.createElement('input'); input.type = field.type === 'person' ? 'text' : (field.type || 'text'); if (field.type === 'file') input.accept = 'image/*'; }
  input.name = subfield ? '' : field.key; input.required = Boolean(field.required); input.placeholder = field.type === 'person' ? '輸入或選擇人員' : (field.placeholder || '');
  if (subfield) input.dataset.subfield = field.key;
  if (field.type === 'multiselect') { const selected = Array.isArray(value) ? value : String(value || '').split(',').map((item) => item.trim()); [...input.options].forEach((option) => { option.selected = selected.includes(option.value); }); }
  else if (field.type !== 'file') input.value = value || field.defaultValue || (field.type === 'date' && field.defaultToday ? today() : '');
  return input;
};

const createField = (field, value = '') => {
  const wrap = document.createElement('label'); wrap.className = `ragic-field ragic-field-${field.type || 'text'}`; wrap.innerHTML = `<span>${field.label}${field.required ? ' *' : ''}</span>`;
  wrap.appendChild(createControl(field, value));
  if (field.type === 'file' && value) { const preview = document.createElement('a'); preview.href = value; preview.target = '_blank'; preview.textContent = '查看已上傳圖片'; preview.className = 'ragic-file-preview'; wrap.appendChild(preview); }
  return wrap;
};

const fileToDataUrl = (file) => new Promise((resolve, reject) => { if (!file) return resolve(''); const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });

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
    else if (field.type === 'file') data[field.key] = input.files?.[0] ? await fileToDataUrl(input.files[0]) : (RAGIC_STATE.records.find((r) => r.id === RAGIC_STATE.currentId)?.[field.key] || '');
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
  getFields().filter((field) => field.type === 'subtable').forEach((field) => { const section = document.createElement('section'); section.className = 'ragic-subtable'; section.dataset.subtable = field.key; section.innerHTML = `<div class="ragic-subtable-head"><h3>${field.label}</h3><button class="secondary" type="button">+ 新增明細</button></div><div class="ragic-table-wrap"><table><thead><tr>${(field.fields || []).map((f) => `<th>${f.label}</th>`).join('')}<th>操作</th></tr></thead><tbody></tbody></table></div>`; const body = section.querySelector('tbody'); ((record[field.key]?.length ? record[field.key] : [{}])).forEach((item) => body.appendChild(renderSubtableRow(field, item))); section.querySelector('button').addEventListener('click', () => body.appendChild(renderSubtableRow(field))); form.appendChild(section); });
};

const canUse = (action) => window.getPagePermission ? Boolean(window.getPagePermission()[action]) : true;
const renderTable = () => { const tbody = document.querySelector('#ragicTableBody'); tbody.innerHTML = ''; RAGIC_STATE.filtered.forEach((record) => { const tr = document.createElement('tr'); tr.tabIndex = 0; tr.innerHTML = listColumns().map((key) => `<td>${valueToText(record[key])}</td>`).join(''); tr.addEventListener('click', () => renderForm(record)); tbody.appendChild(tr); }); };
const applyFilters = () => { const cols = listColumns(); RAGIC_STATE.filtered = RAGIC_STATE.records.filter((record) => cols.every((key) => { const filter = document.querySelector(`[data-filter="${key}"]`)?.value.toLowerCase() || ''; return !filter || valueToText(record[key]).toLowerCase().includes(filter); })); if (RAGIC_STATE.sortKey) RAGIC_STATE.filtered.sort((a, b) => valueToText(a[RAGIC_STATE.sortKey]).localeCompare(valueToText(b[RAGIC_STATE.sortKey]), 'zh-Hant') * (RAGIC_STATE.sortDir === 'asc' ? 1 : -1)); renderTable(); };
const renderHeader = () => { document.querySelector('#ragicHeaderRow').innerHTML = listColumns().map((key) => `<th><button class="sort-btn" type="button" data-sort="${key}">${getFields().find((f) => f.key === key)?.label || key} ⇅</button><input data-filter="${key}" placeholder="篩選" /></th>`).join(''); };

const fieldDesigner = (field = {}, nested = false) => { const row = document.createElement('div'); row.className = 'designer-field'; row.innerHTML = `<input data-role="label" placeholder="欄位名稱" value="${escapeHtml(field.label || '')}"><select data-role="type">${FIELD_TYPES.filter((type) => !nested || type.value !== 'subtable').map((type) => `<option value="${type.value}" ${field.type === type.value ? 'selected' : ''}>${type.label}</option>`).join('')}</select><textarea data-role="options" placeholder="選項，每行一個">${escapeHtml(optionList(field).join('\n'))}</textarea><label class="designer-required"><input data-role="required" type="checkbox" ${field.required ? 'checked' : ''}> 必填</label><div class="designer-actions"><button class="secondary" data-move="up" type="button">↑</button><button class="secondary" data-move="down" type="button">↓</button><button class="ghost danger" data-remove type="button">刪除</button></div><div class="designer-subfields"></div>`; row.dataset.key = field.key || normalizeKey(field.label); const sub = row.querySelector('.designer-subfields'); const sync = () => { sub.hidden = row.querySelector('[data-role="type"]').value !== 'subtable'; }; (field.fields || []).forEach((child) => sub.appendChild(fieldDesigner(child, true))); sub.insertAdjacentHTML('afterbegin', '<button class="secondary" data-add-subfield type="button">+ 子欄位</button>'); row.addEventListener('click', (event) => { if (event.target.matches('[data-remove]')) row.remove(); if (event.target.matches('[data-move="up"]') && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling); if (event.target.matches('[data-move="down"]') && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row); if (event.target.matches('[data-add-subfield]')) sub.appendChild(fieldDesigner({ label: '新子欄位', type: 'text' }, true)); }); row.querySelector('[data-role="type"]').addEventListener('change', sync); sync(); return row; };
const readDesigner = (container) => [...container.children].filter((el) => el.classList.contains('designer-field')).map((row) => { const label = row.querySelector('[data-role="label"]').value.trim() || '未命名欄位'; const type = row.querySelector('[data-role="type"]').value; const field = { key: row.dataset.key || normalizeKey(label), label, type, required: row.querySelector('[data-role="required"]').checked, options: row.querySelector('[data-role="options"]').value.split('\n').map((v) => v.trim()).filter(Boolean) }; if (type === 'subtable') field.fields = readDesigner(row.querySelector('.designer-subfields')); return field; });

const openDesigner = async () => { const modal = document.querySelector('#ragicDesignerModal'); const body = modal.querySelector('.designer-body'); body.innerHTML = ''; getFields().forEach((field) => body.appendChild(fieldDesigner(field))); modal.hidden = false; };
const closeDesigner = () => { document.querySelector('#ragicDesignerModal').hidden = true; };

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
  document.querySelector('#designTableButton')?.addEventListener('click', openDesigner);
  document.querySelector('#closeDesignerButton')?.addEventListener('click', closeDesigner);
  document.querySelector('#addFieldButton')?.addEventListener('click', () => document.querySelector('.designer-body').appendChild(fieldDesigner({ label: '新欄位', type: 'text' })));
  document.querySelector('#saveSchemaButton')?.addEventListener('click', async () => {
    RAGIC_STATE.schema = { fields: readDesigner(document.querySelector('.designer-body')), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (schemaDoc) await schemaDoc.set(RAGIC_STATE.schema, { merge: true });
    closeDesigner();
    renderHeader();
    applyFilters();
  });
  document.querySelector('#newRecordButton').hidden = !canUse('edit'); document.querySelector('button[form="ragicForm"]').hidden = !canUse('edit'); document.querySelector('#newRecordButton').addEventListener('click', () => renderForm()); document.querySelector('#backToListButton').addEventListener('click', () => { document.querySelector('#ragicFormView').hidden = true; document.querySelector('#ragicListView').hidden = false; });
  document.querySelector('#deleteButton').hidden = !canUse('delete'); document.querySelector('#deleteButton').addEventListener('click', async () => { if (!RAGIC_STATE.currentId || !confirm('確定刪除此筆資料？')) return; await collection.doc(RAGIC_STATE.currentId).delete(); document.querySelector('#backToListButton').click(); });
  document.querySelector('#ragicForm').addEventListener('submit', async (event) => { event.preventDefault(); if (!canUse('edit')) return alert('您沒有編輯權限'); const data = await getFormData(); data.updatedAt = firebase.firestore.FieldValue.serverTimestamp(); if (RAGIC_STATE.currentId) await collection.doc(RAGIC_STATE.currentId).set(data, { merge: true }); else await collection.add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); document.querySelector('#backToListButton').click(); });
  document.querySelector('#ragicHeaderRow').addEventListener('input', applyFilters); document.querySelector('#ragicHeaderRow').addEventListener('click', (event) => { const key = event.target.closest('[data-sort]')?.dataset.sort; if (!key) return; RAGIC_STATE.sortDir = RAGIC_STATE.sortKey === key && RAGIC_STATE.sortDir === 'asc' ? 'desc' : 'asc'; RAGIC_STATE.sortKey = key; applyFilters(); });
  if (!collection || !schemaDoc) { RAGIC_STATE.schema = makeDefaultSchema(config); renderHeader(); return; }
  schemaDoc.onSnapshot(async (doc) => { if (!doc.exists) await schemaDoc.set(makeDefaultSchema(config), { merge: true }); RAGIC_STATE.schema = doc.exists ? doc.data() : makeDefaultSchema(config); renderHeader(); applyFilters(); });
  collection.orderBy('updatedAt', 'desc').onSnapshot((snapshot) => { RAGIC_STATE.records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); applyFilters(); });
};
