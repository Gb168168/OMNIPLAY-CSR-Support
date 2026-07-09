const RAGIC_STATE = { records: [], filtered: [], currentId: null, sortKey: '', sortDir: 'asc' };

const valueToText = (value) => {
  if (Array.isArray(value)) return value.join('、');
  if (value?.toDate) return value.toDate().toLocaleString('zh-TW');
  return value ?? '';
};

const today = () => new Date().toISOString().slice(0, 10);

const createField = (field, value = '') => {
  const id = `field-${field.key}`;
  const wrap = document.createElement('label');
  wrap.className = `ragic-field ragic-field-${field.type || 'text'}`;
  wrap.innerHTML = `<span>${field.label}</span>`;
  let input;
  if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = field.rows || 4;
  } else if (field.type === 'select' || field.type === 'multiselect') {
    input = document.createElement('select');
    if (field.type === 'multiselect') input.multiple = true;
    (field.options || []).forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      input.appendChild(opt);
    });
  } else {
    input = document.createElement('input');
    input.type = field.type || 'text';
  }
  input.id = id;
  input.name = field.key;
  input.required = Boolean(field.required);
  input.placeholder = field.placeholder || '';
  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : String(value || '').split(',').map((item) => item.trim());
    [...input.options].forEach((option) => { option.selected = selected.includes(option.value); });
  } else if (field.type !== 'file') {
    input.value = value || field.defaultValue || (field.type === 'date' && field.defaultToday ? today() : '');
  }
  wrap.appendChild(input);
  if (field.type === 'file' && value) {
    const preview = document.createElement('a');
    preview.href = value;
    preview.target = '_blank';
    preview.textContent = '查看已上傳圖片';
    preview.className = 'ragic-file-preview';
    wrap.appendChild(preview);
  }
  return wrap;
};

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) return resolve('');
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const getFormData = async (config) => {
  const data = {};
  for (const field of config.fields) {
    const input = document.querySelector(`[name="${field.key}"]`);
    if (!input) continue;
    if (field.type === 'multiselect') data[field.key] = [...input.selectedOptions].map((opt) => opt.value);
    else if (field.type === 'file') {
      data[field.key] = input.files?.[0] ? await fileToDataUrl(input.files[0]) : (RAGIC_STATE.records.find((r) => r.id === RAGIC_STATE.currentId)?.[field.key] || '');
    } else data[field.key] = input.value.trim();
  }
  if (config.subtable) {
    data[config.subtable.key] = [...document.querySelectorAll('.subtable-row')].map((row) => {
      const item = {};
      config.subtable.fields.forEach((field) => { item[field.key] = row.querySelector(`[data-subfield="${field.key}"]`)?.value.trim() || ''; });
      return item;
    }).filter((item) => Object.values(item).some(Boolean));
  }
  return data;
};

const renderSubtableRow = (config, item = {}) => {
  const row = document.createElement('tr');
  row.className = 'subtable-row';
  config.subtable.fields.forEach((field) => {
    const td = document.createElement('td');
    const control = field.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (field.type !== 'textarea') control.type = field.type || 'text';
    control.dataset.subfield = field.key;
    control.value = item[field.key] || '';
    td.appendChild(control);
    row.appendChild(td);
  });
  const action = document.createElement('td');
  action.innerHTML = '<button class="ghost danger" type="button">刪除</button>';
  action.querySelector('button').addEventListener('click', () => row.remove());
  row.appendChild(action);
  return row;
};

const renderForm = (config, record = {}) => {
  RAGIC_STATE.currentId = record.id || null;
  document.querySelector('#ragicListView').hidden = true;
  const formView = document.querySelector('#ragicFormView');
  formView.hidden = false;
  formView.querySelector('h2').textContent = record.id ? `編輯${config.title}` : `新增${config.title}`;
  const form = formView.querySelector('form');
  form.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'ragic-form-grid';
  config.fields.forEach((field) => grid.appendChild(createField(field, record[field.key])));
  form.appendChild(grid);
  if (config.subtable) {
    const section = document.createElement('section');
    section.className = 'ragic-subtable';
    section.innerHTML = `<div class="ragic-subtable-head"><h3>${config.subtable.label}</h3><button class="secondary" type="button" id="addSubRow">+ 新增明細</button></div><div class="ragic-table-wrap"><table><thead><tr>${config.subtable.fields.map((f) => `<th>${f.label}</th>`).join('')}<th>操作</th></tr></thead><tbody id="subtableBody"></tbody></table></div>`;
    form.appendChild(section);
    const body = section.querySelector('#subtableBody');
    (record[config.subtable.key]?.length ? record[config.subtable.key] : [{}]).forEach((item) => body.appendChild(renderSubtableRow(config, item)));
    section.querySelector('#addSubRow').addEventListener('click', () => body.appendChild(renderSubtableRow(config)));
  }
};

const renderTable = (config) => {
  const tbody = document.querySelector('#ragicTableBody');
  tbody.innerHTML = '';
  RAGIC_STATE.filtered.forEach((record) => {
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.innerHTML = config.listColumns.map((key) => `<td>${valueToText(record[key])}</td>`).join('');
    tr.addEventListener('click', () => renderForm(config, record));
    tbody.appendChild(tr);
  });
};

const applyFilters = (config) => {
  RAGIC_STATE.filtered = RAGIC_STATE.records.filter((record) => config.listColumns.every((key) => {
    const filter = document.querySelector(`[data-filter="${key}"]`)?.value.toLowerCase() || '';
    return !filter || valueToText(record[key]).toLowerCase().includes(filter);
  }));
  if (RAGIC_STATE.sortKey) {
    RAGIC_STATE.filtered.sort((a, b) => valueToText(a[RAGIC_STATE.sortKey]).localeCompare(valueToText(b[RAGIC_STATE.sortKey]), 'zh-Hant') * (RAGIC_STATE.sortDir === 'asc' ? 1 : -1));
  }
  renderTable(config);
};

const initRagicPage = (config) => {
  const db = window.omniplayDb;
  const collection = db?.collection(config.collection);
  document.querySelector('#ragicTitle').textContent = config.title;
  document.querySelector('#ragicSubtitle').textContent = `${config.title}列表、表單與${config.subtable ? '子表單' : '資料'}維護`;
  document.querySelector('#ragicHeaderRow').innerHTML = config.listColumns.map((key) => `<th><button class="sort-btn" type="button" data-sort="${key}">${config.fields.find((f) => f.key === key)?.label || key} ⇅</button><input data-filter="${key}" placeholder="篩選" /></th>`).join('');
  document.querySelector('#newRecordButton').addEventListener('click', () => renderForm(config));
  document.querySelector('#backToListButton').addEventListener('click', () => { document.querySelector('#ragicFormView').hidden = true; document.querySelector('#ragicListView').hidden = false; });
  document.querySelector('#deleteButton').addEventListener('click', async () => {
    if (!RAGIC_STATE.currentId || !confirm('確定刪除此筆資料？')) return;
    await collection.doc(RAGIC_STATE.currentId).delete();
    document.querySelector('#backToListButton').click();
  });
  document.querySelector('#ragicForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = await getFormData(config);
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    if (RAGIC_STATE.currentId) await collection.doc(RAGIC_STATE.currentId).set(data, { merge: true });
    else await collection.add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    document.querySelector('#backToListButton').click();
  });
  document.querySelector('#ragicHeaderRow').addEventListener('input', () => applyFilters(config));
  document.querySelector('#ragicHeaderRow').addEventListener('click', (event) => {
    const key = event.target.closest('[data-sort]')?.dataset.sort;
    if (!key) return;
    RAGIC_STATE.sortDir = RAGIC_STATE.sortKey === key && RAGIC_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    RAGIC_STATE.sortKey = key;
    applyFilters(config);
  });
  if (!collection) return;
  collection.orderBy('updatedAt', 'desc').onSnapshot((snapshot) => {
    RAGIC_STATE.records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    applyFilters(config);
  });
};
