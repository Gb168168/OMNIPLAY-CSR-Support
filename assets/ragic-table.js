
const LOG_FORM_LAYOUT = { columns: 6, rows: 4, columnGap: 12, rowGap: 10, fieldHeight: 64, textareaHeight: 178 };
const LOG_SUBTABLE_COLUMN_RATIOS = [2, 1, 2, 1, 2, 1];
const LOG_LIST_WIDTHS = { issue: 360, note: 260, image: 90, file: 90, serial: 110, date: 150 };
const LOG_FIELD_LAYOUT_BY_LABEL = {
  '發生時間': { row: 1, col: 1 }, '接洽人員': { row: 1, col: 2 }, '客戶': { row: 1, col: 3 }, '分類': { row: 1, col: 4 }, '狀態': { row: 1, col: 5 }, '編號': { row: 1, col: 6 },
  '完成時間': { row: 2, col: 1 }, '完成人員': { row: 2, col: 2 }, '更新日期': { row: 2, col: 3 }, '圖片': { row: 2, col: 4 }, '檔案': { row: 2, col: 5 }, '提報連結': { row: 2, col: 6 },
  '問題描述': { row: 3, col: 1, colSpan: 3, rowSpan: 2, textarea: true }, '備註': { row: 3, col: 4, colSpan: 2, rowSpan: 2, textarea: true }
};

const isLogModule = (config = RAGIC_STATE?.config) => ['log', 'workLogs'].includes(String(config?.collection || config?.dataCollection || '')) || String(config?.title || '').includes('日誌');
const logFieldLayoutFor = (field = {}) => LOG_FIELD_LAYOUT_BY_LABEL[field.label] || null;

const RAGIC_STATE = { records: [], filtered: [], currentId: null, formMode: 'view', sortKey: '', sortDir: 'asc', filters: {}, openMenuKey: '', page: 1, pageSize: 50, config: null, schema: null, unsubscribeRecords: null, collection: null, schemaDoc: null };

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

const normalizeFormLayoutNumber = (value, { min = 1, max = Infinity, fallback = null } = {}) => {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};
const normalizeFormLayoutConfig = (formLayout) => {
  if (Array.isArray(formLayout)) return { columns: 5, overrides: formLayout };
  if (!formLayout || typeof formLayout !== 'object') return { columns: 5, overrides: [] };
  const columns = normalizeFormLayoutNumber(formLayout.columns, { min: 1, max: 10, fallback: 5 });
  const fields = formLayout.fields && typeof formLayout.fields === 'object' ? formLayout.fields : {};
  const overrides = Object.entries(fields).map(([key, layout]) => ({ key, ...(layout || {}) }));
  return { columns, overrides };
};
const normalizeFormLayoutOverride = (override = {}) => {
  const next = { ...override };
  if (next.row !== undefined && next.formRow === undefined) next.formRow = next.row;
  if (next.col !== undefined && next.formCol === undefined) next.formCol = next.col;
  if (next.colSpan !== undefined && next.formColSpan === undefined) next.formColSpan = next.colSpan;
  if (next.rowSpan !== undefined && next.formRowSpan === undefined) next.formRowSpan = next.rowSpan;
  return next;
};

const normalizeDesignerFormLayout = (formLayout = {}, fields = []) => {
  const source = formLayout && typeof formLayout === 'object' ? formLayout : {};
  const columns = normalizeFormLayoutNumber(source.columns, { min: 3, max: 6, fallback: 5 });
  const rows = normalizeFormLayoutNumber(source.rows, { min: 2, max: 10, fallback: 4 });
  const sourceFields = source.fields && typeof source.fields === 'object' ? source.fields : {};
  const fieldKeys = new Set((fields || []).map((field) => field.key).filter(Boolean));
  const nextFields = {};
  Object.entries(sourceFields).forEach(([key, layout]) => {
    if (fieldKeys.size && !fieldKeys.has(key)) return;
    const fixed = null;
    const row = normalizeFormLayoutNumber(fixed?.row ?? layout?.row, { min: 1, max: rows });
    const col = normalizeFormLayoutNumber(fixed?.col ?? layout?.col, { min: 1, max: columns });
    if (!row || !col) return;
    nextFields[key] = {
      row,
      col,
      colSpan: normalizeFormLayoutNumber(fixed?.colSpan ?? layout?.colSpan, { min: 1, max: columns - col + 1, fallback: 1 }),
      rowSpan: normalizeFormLayoutNumber(fixed?.rowSpan ?? layout?.rowSpan, { min: 1, max: rows - row + 1, fallback: 1 }),
      width: fixed ? null : normalizeFormLayoutNumber(layout?.width ?? layout?.formWidth, { min: 40, max: 2000, fallback: null }),
      height: fixed ? (fixed.textarea ? LOG_FORM_LAYOUT.textareaHeight : LOG_FORM_LAYOUT.fieldHeight) : normalizeFormLayoutNumber(layout?.height ?? layout?.formHeight, { min: 32, max: 2000, fallback: null })
    };
  });
  return { columns, rows, fields: nextFields };
};
const applyFormGridLayout = (grid, config = RAGIC_STATE.config) => {
  if (!grid) return grid;
  const { columns } = normalizeFormLayoutConfig(RAGIC_STATE.schema?.formLayout || config?.formLayout);
  grid.style.setProperty('--form-columns', columns || 5);
  return grid;
};
const applyFormLayout = (element, field = {}) => {
  if (!element) return element;
  const activeLayout = normalizeDesignerFormLayout(RAGIC_STATE.schema?.formLayout || RAGIC_STATE.config?.formLayout, getFields());
  const layoutItem = activeLayout.fields?.[field.key] || {};
  const row = normalizeFormLayoutNumber(layoutItem.row ?? field.formRow);
  const columns = activeLayout.columns || 5;
  const col = normalizeFormLayoutNumber(layoutItem.col ?? field.formCol, { max: columns });
  const hasExplicitSubtableSpan = layoutItem.colSpan !== undefined || field.formColSpan !== undefined;
  const colSpan = normalizeFormLayoutNumber(layoutItem.colSpan ?? field.formColSpan, { max: columns, fallback: field.type === 'subtable' && !hasExplicitSubtableSpan ? columns : 1 });
  const rowSpan = normalizeFormLayoutNumber(layoutItem.rowSpan ?? field.formRowSpan, { max: activeLayout.rows || 10, fallback: 1 });
  element.classList.add('form-field');
  element.dataset.type = field.type || 'text';
  if (row || col) element.classList.add('has-form-layout');
  element.classList.toggle('field-value-multiline', field.type === 'textarea');
  element.style.setProperty('--form-row', row || 'auto');
  element.style.setProperty('--form-col', col || 'auto');
  element.style.setProperty('--form-colspan', colSpan || 1);
  element.style.setProperty('--form-rowspan', rowSpan || 1);
  const layoutWidth = normalizeFormFieldSize(layoutItem.width ?? field.formWidth, MIN_FORM_FIELD_WIDTH);
  const layoutHeight = normalizeFormFieldSize(layoutItem.height ?? field.formHeight, MIN_FORM_FIELD_HEIGHT);
  if (layoutItem.width || (field.formWidth && field.type !== 'subtable')) element.style.width = `${layoutWidth}px`;
  if (layoutItem.height || field.formHeight) {
    if (field.type === 'subtable') {
      element.style.minHeight = `${layoutHeight}px`;
    } else {
      element.style.height = `${layoutHeight}px`;
      element.style.minHeight = `${layoutHeight}px`;
    }
  }
  return element;
};
const fieldLayoutOverrideMatches = (field = {}, override = {}) => {
  const key = String(field.key || '');
  const label = String(field.label || '');
  if (override.key && key === override.key) return true;
  if (override.keyIncludes && key.includes(override.keyIncludes)) return true;
  if (override.label && label === override.label) return true;
  return false;
};
const applyFormLayoutOverrides = (schema = {}, config = {}) => {
  const activeLayout = schema.formLayout || config.formLayout;
  const { columns, overrides: rawOverrides } = normalizeFormLayoutConfig(activeLayout);
  const overrides = rawOverrides.map(normalizeFormLayoutOverride);
  if (!Array.isArray(schema.fields)) return schema;
  const layoutRows = overrides
    .filter((item) => !item._titleOnly)
    .map((item) => normalizeFormLayoutNumber(item.formRow, { fallback: 0 }))
    .filter(Boolean);
  const subtableRow = (layoutRows.length ? Math.max(...layoutRows) : 0) + 1;
  return {
    ...schema,
    fields: schema.fields.map((field) => {
      const override = overrides.find((item) => !item._titleOnly && fieldLayoutOverrideMatches(field, item));
      const next = override ? { ...field } : (field.type === 'subtable' ? { ...field } : field);
      if (override) {
        ['formRow', 'formCol', 'formColSpan', 'formRowSpan', '_titleOnly'].forEach((prop) => {
          if (override[prop] !== undefined) next[prop] = override[prop];
        });
      }
      if (next.type === 'subtable' && !next.formRow && !next.formCol) {
        next.formRow = subtableRow;
        next.formCol = 1;
        next.formColSpan = columns || 5;
        next.formRowSpan = 1;
      }
      return next;
    })
  };
};
const normalizeSubtableColumnsPerRow = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(10, Math.max(1, parsed));
};
const normalizeField = (field = {}, fallback = 'field', usedKeys = new Set()) => {
  const label = String(field.label || field.key || '未命名欄位');
  const type = field.type || 'text';
  const normalized = {
    ...field,
    key: uniqueKey(field.key || label, usedKeys, fallback),
    label,
    type,
    width: normalizeFieldWidth(field.width),
    formWidth: normalizeFormFieldSize(field.formWidth, MIN_FORM_FIELD_WIDTH),
    formHeight: normalizeFormFieldSize(field.formHeight, MIN_FORM_FIELD_HEIGHT),
    options: optionList(field),
    fields: normalizeFields(field.fields || [], 'subfield')
  };
  if (type === 'subtable') normalized.columnsPerRow = normalizeSubtableColumnsPerRow(field.columnsPerRow);
  else delete normalized.columnsPerRow;
  return normalized;
};
const normalizeSchema = (schema = {}) => ({ fields: normalizeFields(schema.fields || [], 'field'), formLayout: normalizeDesignerFormLayout(schema.formLayout, schema.fields || []) });
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
const DEFAULT_FIELD_WIDTHS = { text: 180, textarea: 300, date: 100, datetime: 150, select: 100, multiselect: 120, image: 80, file: 160, serial: 90, createdDate: 150, updatedDate: 150, link: 180 };
const MIN_FORM_FIELD_WIDTH = 56;
const MIN_FORM_FIELD_HEIGHT = 38;
const DEFAULT_FORM_FIELD_HEIGHT = 48;
const DEFAULT_SUBTABLE_FIELD_HEIGHT = 180;
const normalizeFormFieldSize = (value, min = 1) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? Math.max(min, Math.round(parsed)) : null; };
const normalizeFieldWidth = (width) => { const value = Number(width); return Number.isFinite(value) && value > 0 ? Math.round(value) : null; };
const fieldColumnWidth = (field = {}) => {
  if (isLogModule()) {
    if (field.label === '問題描述') return LOG_LIST_WIDTHS.issue;
    if (field.label === '備註') return LOG_LIST_WIDTHS.note;
    if (field.type === 'image') return LOG_LIST_WIDTHS.image;
    if (field.type === 'file') return LOG_LIST_WIDTHS.file;
    if (field.type === 'serial' || field.label === '編號') return LOG_LIST_WIDTHS.serial;
    if (['date','datetime','updatedDate'].includes(field.type)) return LOG_LIST_WIDTHS.date;
  }
  return normalizeFieldWidth(field.width) || DEFAULT_FIELD_WIDTHS[field.type] || null;
};
const defaultFormFieldHeight = (field = {}) => field.type === 'subtable' ? DEFAULT_SUBTABLE_FIELD_HEIGHT : DEFAULT_FORM_FIELD_HEIGHT;
const layoutHeightValue = (item = {}, field = {}) => normalizeFormLayoutNumber(item.height ?? field.formHeight, { min: MIN_FORM_FIELD_HEIGHT, max: 2000, fallback: defaultFormFieldHeight(field) });
const columnWidthStyle = (width) => width ? ` style="--col-width: ${width}px; min-width: ${width}px !important; width: ${width}px;"` : '';
const applyColumnWidth = (element, width) => {
  if (!element || !width) return;
  element.style.setProperty('--col-width', `${width}px`);
  element.style.setProperty('min-width', `${width}px`, 'important');
  element.style.setProperty('width', `${width}px`);
};


const MIN_COLUMN_WIDTH = 40;
const setColumnWidth = (table, th, width) => {
  const newWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(Number(width) || MIN_COLUMN_WIDTH));
  applyColumnWidth(th, newWidth);
  const colIndex = th?.cellIndex ?? -1;
  if (!table || colIndex < 0) return newWidth;
  const col = table.querySelector(`colgroup col:nth-child(${colIndex + 1})`);
  if (col) applyColumnWidth(col, newWidth);
  table.querySelectorAll(`tbody td:nth-child(${colIndex + 1})`).forEach((td) => applyColumnWidth(td, newWidth));
  return newWidth;
};
const saveSchema = async () => {
  if (!RAGIC_STATE.schemaDoc || !RAGIC_STATE.schema) return false;
  RAGIC_STATE.schema = { ...RAGIC_STATE.schema, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  await RAGIC_STATE.schemaDoc.set(RAGIC_STATE.schema, { merge: true });
  return true;
};

const adjustFontSize = (fieldEl) => {
  if (!fieldEl) return;
  const width = fieldEl.offsetWidth;
  let size = '14px';
  if (width < 80) size = '11px';
  else if (width < 120) size = '12px';
  else if (width < 180) size = '13px';
  fieldEl.style.fontSize = size;
  fieldEl.querySelectorAll('.ragic-view-label, .ragic-view-value, .field-value, span, td, th').forEach((item) => { item.style.fontSize = size; });
};
const appendFormResizeHandles = (element, field, { target = field } = {}) => {
  if (!element || !target || element.dataset.formResizeBound === 'true') return element;
  element.dataset.formResizeBound = 'true';
  element.classList.add('form-field-resizable');
  const right = document.createElement('span');
  right.className = 'resize-handle-right';
  const bottom = document.createElement('span');
  bottom.className = 'resize-handle-bottom';
  element.append(right, bottom);
  const startResize = (event, type) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.pageX;
    const startY = event.pageY;
    const startWidth = element.offsetWidth;
    const startHeight = element.offsetHeight;
    const handle = type === 'width' ? right : bottom;
    handle.classList.add('resizing');
    const move = (moveEvent) => {
      if (type === 'width') {
        const width = Math.max(MIN_FORM_FIELD_WIDTH, Math.round(startWidth + moveEvent.pageX - startX));
        element.style.width = `${width}px`;
      } else {
        const height = Math.max(MIN_FORM_FIELD_HEIGHT, Math.round(startHeight + moveEvent.pageY - startY));
        element.style.height = `${height}px`;
        element.style.minHeight = `${height}px`;
      }
      adjustFontSize(element);
    };
    const up = async () => {
      handle.classList.remove('resizing');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (type === 'width') target.formWidth = Math.max(MIN_FORM_FIELD_WIDTH, Math.round(element.offsetWidth));
      else target.formHeight = Math.max(MIN_FORM_FIELD_HEIGHT, Math.round(element.offsetHeight));
      await saveSchema();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  right.addEventListener('mousedown', (event) => startResize(event, 'width'));
  bottom.addEventListener('mousedown', (event) => startResize(event, 'height'));
  adjustFontSize(element);
  return element;
};

const attachColumnResizers = (headerRow) => {
  const table = headerRow?.closest('table');
  if (!table) return;
  headerRow.querySelectorAll('th[data-field-key]').forEach((th) => {
    th.style.position = 'relative';
    th.querySelector('.col-resizer')?.remove();
    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    th.appendChild(resizer);
    let startX = 0;
    let startWidth = 0;
    resizer.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      startX = event.pageX;
      startWidth = th.offsetWidth;
      resizer.classList.add('is-dragging');
      document.body.classList.add('is-col-resizing');
      const onMouseMove = (moveEvent) => {
        setColumnWidth(table, th, startWidth + (moveEvent.pageX - startX));
      };
      const onMouseUp = async () => {
        resizer.classList.remove('is-dragging');
        document.body.classList.remove('is-col-resizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        const field = getFields().find((item) => item.key === th.dataset.fieldKey);
        if (field) {
          field.width = Math.max(MIN_COLUMN_WIDTH, Math.round(th.offsetWidth));
          await saveSchema();
        }
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
};

const applyRagicColumnGroup = (table, fields = listFields()) => {
  if (!table) return;
  table.querySelector('colgroup')?.remove();
  const colgroup = document.createElement('colgroup');
  const markerCol = document.createElement('col');
  markerCol.style.setProperty('min-width', '50px', 'important');
  markerCol.style.setProperty('width', '50px');
  colgroup.appendChild(markerCol);
  fields.forEach((field) => {
    const col = document.createElement('col');
    const width = fieldColumnWidth(field);
    if (width) {
      col.style.setProperty('min-width', `${width}px`, 'important');
      col.style.setProperty('width', `${width}px`);
    }
    colgroup.appendChild(col);
  });
  table.insertBefore(colgroup, table.firstChild);
};

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
  return `<td class="icon-actions col-marker marker-cell">
    <span class="fire-btn ${record.fire ? 'active' : ''}" data-icon-action="fire" data-doc-id="${escapeHtml(record.id)}" role="button" tabindex="0" title="重要/今日交接">🔥</span>
    <span class="pin-btn ${pinned ? 'active' : ''}" data-icon-action="pin" data-doc-id="${escapeHtml(record.id)}" role="button" tabindex="0" title="個人釘選">📌</span>
  </td>`;
};


const defaultConfigFields = (config = {}) => [
  ...(config.fields || []),
  ...(config.subtable ? [{ ...config.subtable, type: 'subtable', fields: config.subtable.fields || [] }] : [])
];

const mergeLogConfigFields = (schema = {}, config = {}) => {
  if (!isLogModule(config)) return schema;
  const schemaFields = Array.isArray(schema.fields) ? schema.fields : [];
  return {
    ...schema,
    fields: schemaFields.length ? schemaFields : defaultConfigFields(config),
    formLayout: schema.formLayout || config.formLayout
  };
};


const makeDefaultSchema = (config) => applyFormLayoutOverrides(normalizeSchema({
  fields: [...(config.fields || []), ...(config.subtable ? [{ ...config.subtable, type: 'subtable', fields: config.subtable.fields || [] }] : [])]
}), config);

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
  if (field.type === 'checkbox' || field.type === 'boolean') { const input = document.createElement('input'); input.type = 'checkbox'; input.name = subfield ? '' : field.key; if (subfield) input.dataset.subfield = field.key; input.checked = value === true || value === 'true' || value === '1'; return input; }
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
  textarea.style.height = '';
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
    autoGrowTextarea(control);
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
  applyFormLayout(wrap, field);
  const control = createControl(field, value);
  wrap.appendChild(field.type === 'image' || field.type === 'file' ? createFileUploadArea(field, control, value) : control);
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

const getFileInputValue = (input) => {
  if (!input?.dataset.fileValue) return '';
  try { return JSON.parse(input.dataset.fileValue); }
  catch (_) { return input.dataset.fileValue; }
};

const getSubtableAttachmentValue = (row, sub) => {
  const container = row.querySelector(`[data-subfield-container="${sub.key}"]`);
  const input = row.querySelector(`[data-subfield="${sub.key}"]`);
  if (sub.type === 'image') {
    if (container?.dataset.imageCleared === 'true') return [];
    const images = container ? [...container.querySelectorAll('img')].map((img) => img.src).filter(Boolean) : [];
    const value = images.length ? images : getImageInputValues(input);
    return value.length === 1 ? value[0] : value;
  }
  if (container?.dataset.fileCleared === 'true') return '';
  const hiddenInput = row.querySelector(`input[data-subfield="${sub.key}"][type="hidden"]`);
  return hiddenInput?.value || getFileInputValue(input) || input?.dataset?.imageValue || '';
};

const getFormData = async () => {
  const data = {};
  const allImages = [];
  for (const field of getFields()) {
    if (field.type === 'subtable') {
      data[field.key] = [...document.querySelectorAll(`[data-subtable="${field.key}"] .subtable-row`)].map((row) => {
         const item = {};
        (field.fields || []).forEach((sub) => {
          const control = row.querySelector(`[data-subfield="${sub.key}"]`);
          if (sub.type === 'image' || sub.type === 'file') {
            item[sub.key] = getSubtableAttachmentValue(row, sub);
            if (sub.type === 'image') allImages.push(...normalizeImageArray(item[sub.key]));
          } else if (sub.type === 'multiselect') {
            item[sub.key] = control ? [...control.selectedOptions].map((opt) => opt.value) : [];
          } else {
            item[sub.key] = control?.value?.trim() || '';
          }
        });
        return item;    
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
      data[field.key] = container?.dataset.fileCleared === 'true' ? '' : (input.files?.[0] ? await fileToBase64Payload(input.files[0]) : (getFileInputValue(input)));
    }
    else if (field.type === 'checkbox' || field.type === 'boolean') data[field.key] = input.checked;
    else data[field.key] = input.value.trim();
  }
  assertImageTotalWithinLimit(allImages);
  return data;
};

const createFileUploadArea = (field, control, value = '', { subfield = false } = {}) => {
  const fileArea = document.createElement('div');
  fileArea.className = 'image-upload-area';
  fileArea.tabIndex = 0;
  if (subfield) fileArea.dataset.subfieldContainer = field.key;
  else fileArea.dataset.field = field.key;
  fileArea.dataset.fileLabel = field.label || field.key;
  fileArea.dataset.fileType = field.type;
  fileArea.innerHTML = `<div>選擇檔案 或 Ctrl+V 貼上${field.type === 'image' ? '圖片' : '檔案'}</div>`;
  fileArea.appendChild(control);
  if (value) field.type === 'image' ? showImagePreview(normalizeImageArray(value), fileArea, field.label) : showFilePreview(value, fileArea);
  return fileArea;
};

const attachImageUploadArea = (imageArea) => {
  if (!imageArea || imageArea.dataset.uploadBound === 'true') return;
  imageArea.dataset.uploadBound = 'true';
  const input = imageArea.querySelector('input[type="file"]');
  input?.addEventListener('change', async () => {
    if (!input.files?.[0]) return;
    try { imageArea.dataset.fileType === 'file' ? await processGenericFile(input.files[0], imageArea) : await processImageFiles(input.files, imageArea); }
    catch (error) { alert(error.message || '圖片處理失敗，請稍後再試。'); input.value = ''; }
  });
  imageArea.addEventListener('paste', (event) => handleImagePaste(event, imageArea).catch((error) => alert(error.message || '圖片處理失敗，請稍後再試。')));
};



const titleOnlyLayoutFields = () => {
  const fields = getFields();
  const overrides = normalizeFormLayoutConfig(RAGIC_STATE.schema?.formLayout || RAGIC_STATE.config?.formLayout).overrides.map(normalizeFormLayoutOverride);
  return overrides.filter((override) => override._titleOnly).map((override) => {
    const source = fields.find((field) => fieldLayoutOverrideMatches(field, override));
    return source ? { ...source, ...override, type: 'titleOnly', sourceType: source.type } : null;
  }).filter(Boolean);
};
const titleOnlyDisplayValue = (field = {}, record = {}) => {
  const value = record[field.key];
  if (Array.isArray(value)) {
    const source = getFields().find((item) => item.key === field.key);
    const firstRow = value.find((row) => row && Object.values(row).some(Boolean)) || {};
    const firstSubfield = (source?.fields || []).find((sub) => firstRow[sub.key] !== undefined && firstRow[sub.key] !== '');
    return firstSubfield ? renderDisplayValue(firstSubfield, firstRow[firstSubfield.key]) : '<span class="ragic-view-empty">—</span>';
  }
  return renderDisplayValue(field, value);
};
const createTitleOnlyField = (field = {}, record = {}) => {
  const item = document.createElement('div');
  item.className = 'ragic-view-field ragic-view-field-title-only';
  applyFormLayout(item, field);
  item.innerHTML = `<div class="ragic-view-label">${escapeHtml(field.label || field.key)}</div><div class="ragic-view-value field-value">${titleOnlyDisplayValue(field, record)}</div>`;
  appendFormResizeHandles(item, field);
  return item;
};

const currentFilteredIndex = () => RAGIC_STATE.filtered.findIndex((item) => item.id === RAGIC_STATE.currentId);
const currentRecord = () => RAGIC_STATE.records.find((item) => item.id === RAGIC_STATE.currentId) || RAGIC_STATE.filtered.find((item) => item.id === RAGIC_STATE.currentId) || null;
const renderDisplayValue = (field, value) => {
  if (field?.type === 'image') {
    const images = normalizeImageArray(value);
    if (!images.length) return '<span class="ragic-view-empty">—</span>';
    return `<div class="ragic-view-images">${images.map((src, index) => `<img class="ragic-view-image" src="${escapeHtml(src)}" alt="${escapeHtml(field.label || '圖片')} ${index + 1}" title="點擊放大檢視">`).join('')}</div>`;
  }
  if (field?.type === 'file') return renderFileCell(value, field.label || '檔案') || '<span class="ragic-view-empty">—</span>';
  if (field?.type === 'checkbox' || field?.type === 'boolean') return value ? '是' : '否';
  if (field?.type === 'link') return value ? `<a class="ragic-link" href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>` : '<span class="ragic-view-empty">—</span>';
  if (field?.type === 'date') return escapeHtml(displayDate(value)) || '<span class="ragic-view-empty">—</span>';
  if (field?.type === 'datetime') return escapeHtml(displayDateTime(value)) || '<span class="ragic-view-empty">—</span>';
  const text = String(valueToText(value));
  return text ? escapeHtml(text).replace(/\n/g, '<br>') : '<span class="ragic-view-empty">—</span>';
};
const subtableViewColumnWidth = (sub = {}) => normalizeFieldWidth(sub.formWidth ?? sub.width);
const subtableViewCellStyle = (sub = {}) => {
  const width = subtableViewColumnWidth(sub);
  const height = normalizeFormFieldSize(sub.formHeight, MIN_FORM_FIELD_HEIGHT);
  return `${width ? `width:${width}px;min-width:${width}px;max-width:${width}px;` : ''}${height ? `height:${height}px;` : ''}`;
};
const renderSubtableView = (field, rows = []) => {
  const subfields = field.fields || [];
  const bodyRows = (Array.isArray(rows) ? rows : []).filter((item) => item && Object.values(item).some((value) => Array.isArray(value) ? value.length : value));
  if (!subfields.length) return '<div class="ragic-view-empty">尚未設定子欄位</div>';
  if (!bodyRows.length) return '<div class="ragic-view-empty">無資料</div>';
  const columnWidths = subfields.map(subtableViewColumnWidth);
  const explicitTableWidth = columnWidths.every(Boolean) ? columnWidths.reduce((sum, width) => sum + width, 0) : null;
  const colgroup = `<colgroup>${subfields.map((sub, index) => {
    const width = columnWidths[index];
    return `<col${width ? ` style="width:${width}px;min-width:${width}px;max-width:${width}px;"` : ''}>`;
  }).join('')}</colgroup>`;
  const tableStyle = explicitTableWidth ? ` style="width:${explicitTableWidth}px;min-width:${explicitTableWidth}px;"` : '';
  const header = subfields.map((sub) => `<th class="form-field-resizable ragic-view-subfield" data-subfield-key="${escapeHtml(sub.key)}" style="${subtableViewCellStyle(sub)}">${escapeHtml(sub.label || sub.key)}</th>`).join('');
  const body = bodyRows.map((item) => `<tr>${subfields.map((sub) => `<td class="form-field-resizable ragic-view-subfield" data-subfield-key="${escapeHtml(sub.key)}" style="${subtableViewCellStyle(sub)}"><div class="ragic-view-value field-value">${renderDisplayValue(sub, item[sub.key])}</div></td>`).join('')}</tr>`).join('');
  return `<div class="ragic-table-wrap ragic-view-subtable-wrap"><table class="ragic-view-subtable"${tableStyle}>${colgroup}<thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
};

const renderViewForm = (form, record = {}) => {
  const fixedLogLayout = false;
  const grid = document.createElement('div');
  grid.className = 'ragic-form-grid ragic-view-grid';
  applyFormGridLayout(grid);
  getFields().filter((field) => {
    if (field.type === 'subtable') return false;
    return !fixedLogLayout || Boolean(logFieldLayoutFor(field));
  }).forEach((field) => {
    const item = document.createElement('div');
    item.className = `ragic-view-field ragic-view-field-${field.type || 'text'}`;
    applyFormLayout(item, field);
    item.innerHTML = `<div class="ragic-view-label">${escapeHtml(field.label || field.key)}</div><div class="ragic-view-value field-value">${renderDisplayValue(field, record[field.key])}</div>`;
    appendFormResizeHandles(item, field);
    grid.appendChild(item);
  });
  if (!fixedLogLayout) titleOnlyLayoutFields().forEach((field) => grid.appendChild(createTitleOnlyField(field, record)));
  form.appendChild(grid);
  
  getFields().filter((field) => field.type === 'subtable').forEach((field) => {
    const section = document.createElement('section');
    section.className = 'ragic-subtable ragic-view-subtable-section';
    if (!fixedLogLayout) applyFormLayout(section, field);
    section.dataset.subtable = field.key;
    section.innerHTML = `<div class="ragic-subtable-head"><h3 class="ragic-subtable-title">${escapeHtml(field.label)}</h3></div>${renderSubtableView(field, record[field.key])}`;
    appendFormResizeHandles(section, field);
    form.appendChild(section);
  });
  form.querySelectorAll('.ragic-view-subtable-section').forEach((section) => {
    const parentField = getFields().find((field) => field.key === section.dataset.subtable);
    section.querySelectorAll('.ragic-view-subfield[data-subfield-key]').forEach((cell) => {
      const subfield = (parentField?.fields || []).find((sub) => sub.key === cell.dataset.subfieldKey);
      if (subfield) appendFormResizeHandles(cell, subfield, { target: subfield });
    });
  });
};
const formDisplayName = () => {
  const configuredName = RAGIC_STATE.config?.tableName || RAGIC_STATE.config?.title || '';
  const pageTitle = document.title ? document.title.split(/[｜|-]/)[0].trim() : '';
  const baseName = String(configuredName || pageTitle || '表單').trim();
  return baseName.includes('表單') ? baseName : `${baseName}表單`;
};
const renderFormToolbar = () => {
  const formView = document.querySelector('#ragicFormView');
  const legacyToolbar = formView?.querySelector('.ragic-form-toolbar');
  if (!legacyToolbar) return;
  legacyToolbar.classList.add('form-toolbar');
  const modeLabel = RAGIC_STATE.formMode === 'edit' ? '編輯' : '檢視';
  legacyToolbar.innerHTML = `<div class="form-toolbar-left"><button class="pager-btn" id="ragicPrevRecord" type="button">&lt; 上一筆</button><button class="pager-btn" id="ragicNextRecord" type="button">下一筆 &gt;</button></div><div class="form-toolbar-center ragic-form-title">${escapeHtml(modeLabel)}：${escapeHtml(formDisplayName())}</div><div class="form-toolbar-right"></div>`;
  const actions = legacyToolbar.querySelector('.form-toolbar-right');
  if (RAGIC_STATE.currentId && RAGIC_STATE.formMode !== 'edit' && canUse('edit')) {
    actions.insertAdjacentHTML('beforeend', '<button class="edit-btn" id="ragicEditRecord" type="button">✏️編輯</button>');
  }
  if (!RAGIC_STATE.currentId || RAGIC_STATE.formMode === 'edit') {
    actions.insertAdjacentHTML('beforeend', '<button class="save-btn" form="ragicForm" type="submit">儲存</button>');
    if (RAGIC_STATE.currentId) actions.insertAdjacentHTML('beforeend', '<button class="btn-secondary" id="ragicCancelEdit" type="button">取消</button>');
    } else if (RAGIC_STATE.currentId) {
    actions.insertAdjacentHTML('beforeend', '<button class="btn-secondary" id="ragicCloseForm" type="button">取消</button>');
  }
  const deleteButton = document.querySelector('#deleteButton');
  if (deleteButton) {
    deleteButton.className = 'btn-delete';
    deleteButton.type = 'button';
    deleteButton.textContent = '刪除';
    actions.appendChild(deleteButton);
  }
  const index = currentFilteredIndex();
  const prev = legacyToolbar.querySelector('#ragicPrevRecord');
  const next = legacyToolbar.querySelector('#ragicNextRecord');
  const disablePaging = RAGIC_STATE.formMode === 'edit' || !RAGIC_STATE.currentId;
  if (prev) prev.disabled = disablePaging || index <= 0;
  if (next) next.disabled = disablePaging || index < 0 || index >= RAGIC_STATE.filtered.length - 1;
};
const openRecordAtIndex = (index) => {
  if (RAGIC_STATE.formMode === 'edit') return;
  const record = RAGIC_STATE.filtered[index];
  if (record) renderForm(record, { mode: 'view' });
};

const renderSubtableRow = (field, item = {}) => {
  const row = document.createElement('tr');
  row.className = 'subtable-row';

  const cell = document.createElement('td');
  cell.colSpan = Math.max((field.fields || []).length, 1);

  const fieldsGrid = document.createElement('div');
  fieldsGrid.className = 'subtable-row-fields';
  fieldsGrid.style.setProperty('--subtable-cols', normalizeSubtableColumnsPerRow(field.columnsPerRow));

  (field.fields || []).forEach((sub) => {
    const fieldWrap = document.createElement('label');
    fieldWrap.className = `subtable-row-field subtable-row-field-${sub.type || 'text'}`;
    fieldWrap.innerHTML = `<span>${escapeHtml(sub.label || sub.key)}${sub.required ? ' *' : ''}</span>`;
    const control = createControl(sub, item[sub.key], true);
    fieldWrap.appendChild(sub.type === 'image' || sub.type === 'file' ? createFileUploadArea(sub, control, item[sub.key], { subfield: true }) : control);
    fieldsGrid.appendChild(fieldWrap);
  });
  
  const removeButton = document.createElement('button');
  removeButton.className = 'subtable-row-delete ghost danger';
  removeButton.type = 'button';
  removeButton.title = '刪除此列';
  removeButton.setAttribute('aria-label', '刪除此列');
  removeButton.textContent = '×';
  removeButton.addEventListener('click', () => row.remove());

  cell.appendChild(removeButton);
  cell.appendChild(fieldsGrid);
  row.appendChild(cell);
  return row;
};


const setRagicFormOverlayOffset = () => {
  const main = document.querySelector('.main, .main-content');
  const topbar = main?.querySelector(':scope > .topbar');
  if (!main || !topbar) return;
  main.style.setProperty('--ragic-form-overlay-top', `${topbar.offsetHeight}px`);
};

const setRagicViewMode = (mode) => {
  const listView = document.querySelector('#ragicListView');
  const formView = document.querySelector('#ragicFormView');
  const main = document.querySelector('.main, .main-content');
  listView?.classList.add('ragic-list-section');
  formView?.classList.add('ragic-form-container');
  if (mode === 'form') {
    setRagicFormOverlayOffset();
    if (listView) listView.hidden = true;
    if (formView) formView.hidden = false;
    main?.classList.add('is-form-view');
    return;
  }
  if (formView) formView.hidden = true;
  if (listView) listView.hidden = false;
  main?.classList.remove('is-form-view');
};

const renderForm = (record = {}, { mode = record.id ? 'view' : 'edit' } = {}) => {
  RAGIC_STATE.currentId = record.id || null;
  RAGIC_STATE.formMode = mode;
  const fixedLogLayout = false;
  setRagicViewMode('form');
  const formView = document.querySelector('#ragicFormView');
  const legacyTitle = formView.querySelector('h2');
  if (legacyTitle) legacyTitle.textContent = record.id ? (mode === 'edit' ? `編輯${RAGIC_STATE.config.title}` : `檢視${RAGIC_STATE.config.title}`) : `新增${RAGIC_STATE.config.title}`;
  renderFormToolbar();
  const bottomActions = formView.querySelector('.ragic-actions');
  if (bottomActions) bottomActions.hidden = true;
  const form = formView.querySelector('form');
  form.innerHTML = '';
  if (mode === 'view' && record.id) {
    renderViewForm(form, record);
  } else {
    const grid = document.createElement('div'); grid.className = 'ragic-form-grid'; applyFormGridLayout(grid);
    getFields().filter((field) => field.type !== 'subtable').forEach((field) => grid.appendChild(createField(field, record[field.key])));
    titleOnlyLayoutFields().forEach((field) => grid.appendChild(createTitleOnlyField(field, record)));
    form.appendChild(grid);
    getFields().filter((field) => field.type === 'subtable').forEach((field) => {
     const section = document.createElement('section');
      section.className = 'ragic-subtable';
      if (!fixedLogLayout) applyFormLayout(section, field);
      section.dataset.subtable = field.key;
      section.innerHTML = `<div class="ragic-subtable-head"><h3 class="ragic-subtable-title">${escapeHtml(field.label)}</h3><button class="secondary" type="button">+ 新增明細</button></div><div class="ragic-table-wrap"><table><tbody></tbody></table></div>`;
      const body = section.querySelector('tbody');
      ((record[field.key]?.length ? record[field.key] : [{}])).forEach((item) => body.appendChild(renderSubtableRow(field, item)));
      section.querySelector('button').addEventListener('click', () => {
        if (canUse('edit')) {
          const row = renderSubtableRow(field);
          body.appendChild(row);
          row.querySelectorAll('.image-upload-area').forEach(attachImageUploadArea);
        }
      });
      (fixedLogLayout ? form : grid).appendChild(section);
    });
    form.querySelectorAll('.image-upload-area').forEach(attachImageUploadArea);
    setFormEditable(form);
  }
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
      const columnClass = `${ragicColumnClass(field)}${field.type === 'textarea' ? ' col-textarea' : ''}`;
      const typeAttr = field.type ? ` data-type="${escapeHtml(field.type)}" data-field-type="${escapeHtml(field.type)}"` : '';
      const title = columnClass === 'col-content' ? ` title="${escapeHtml(cellTooltipText(record, field))}"` : '';
      const width = fieldColumnWidth(field);
      const style = columnWidthStyle(width);
      return `<td class="${columnClass}" data-doc-id="${escapeHtml(record.id)}" data-field-key="${escapeHtml(field.key)}"${typeAttr}${style}${title}>${renderCell(record, field)}</td>`;
    }).join('');
    fields.forEach((field) => {
      applyColumnWidth(tr.querySelector(`td[data-field-key="${CSS.escape(field.key)}"]`), fieldColumnWidth(field));
    });
    let rowClickTimer = null;
    tr.addEventListener('click', (event) => {
      if (event.target.closest('.marker-cell, a, button, .ragic-thumbnail, .editing')) return;
      if (rowClickTimer) window.clearTimeout(rowClickTimer);
      rowClickTimer = window.setTimeout(() => renderForm(record), 180);
    });
    if (canUse('edit')) {
      tr.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (rowClickTimer) {
          window.clearTimeout(rowClickTimer);
          rowClickTimer = null;
        }
        const cell = event.target.closest('td[data-field-key]');
        if (cell) startInlineEdit(cell);
      });
    }
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


const openRecordFromQuery = () => {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id || RAGIC_STATE.currentId === id) return;
  const record = RAGIC_STATE.records.find((item) => item.id === id);
  if (record) renderForm(record);
};

const renderFilteredList = (filtered) => {
  RAGIC_STATE.filtered = [...filtered];
  if (RAGIC_STATE.sortKey) RAGIC_STATE.filtered.sort((a, b) => compareRecords(a, b, RAGIC_STATE.sortKey, RAGIC_STATE.sortDir));
  RAGIC_STATE.page = 1;
  renderTable();
  openRecordFromQuery();
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

const normalizeFilterValue = (value) => Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : String(value || '').trim();
const isSelectFilterField = (field = {}) => ['select', 'multiselect'].includes(field.type);

const filterMatchesRecord = (record, fieldKey, filterValue) => {
  if (Array.isArray(filterValue)) {
    if (!filterValue.length) return true;
    const recordValues = Array.isArray(record[fieldKey]) ? record[fieldKey].map((item) => String(item || '').trim()) : [String(record[fieldKey] || '').trim()];
    return filterValue.some((option) => recordValues.includes(option));
  }
  const keyword = String(filterValue || '').trim().toLowerCase();
  if (!keyword) return true;
  return valueToText(record[fieldKey]).toString().toLowerCase().includes(keyword);
};

const applyFilters = () => {
  const filters = Object.fromEntries(Object.entries(RAGIC_STATE.filters).map(([key, value]) => [key, normalizeFilterValue(value)]).filter(([, value]) => Array.isArray(value) ? value.length : value));
  const filtered = RAGIC_STATE.records.filter((record) => Object.entries(filters).every(([fieldKey, filterValue]) => filterMatchesRecord(record, fieldKey, filterValue)));
  renderFilteredList(filtered);
  updateColumnMenuStates();
};


const closeAllMenus = (exceptKey = '') => {
  document.querySelectorAll('.col-menu-dropdown').forEach((menu) => {
    if (menu.dataset.menu !== exceptKey) menu.hidden = true;
  });
  RAGIC_STATE.openMenuKey = exceptKey;
};

const toggleColumnMenu = (key) => {
  const selectorKey = window.CSS?.escape ? CSS.escape(key) : String(key).replace(/"/g, '\\"');
  const tableWrap = document.querySelector('#ragicHeaderRow')?.closest('.ragic-table-wrap, .ragic-table-wrapper');
  const menu = (tableWrap || document).querySelector(`.col-menu-dropdown[data-menu="${selectorKey}"]`);
  if (!menu) return;
  const willOpen = menu.hidden;
  closeAllMenus(willOpen ? key : '');
  menu.hidden = !willOpen;
  if (willOpen) menu.querySelector('[data-menu-filter]')?.focus();
};

const sortByField = (fieldKey, direction) => {
  RAGIC_STATE.sortKey = fieldKey;
  RAGIC_STATE.sortDir = direction;
  RAGIC_STATE.filtered.sort((a, b) => {
    const va = valueToText(a[fieldKey]).toString();
    const vb = valueToText(b[fieldKey]).toString();
    return direction === 'asc' ? va.localeCompare(vb, 'zh-Hant', { numeric: true }) : vb.localeCompare(va, 'zh-Hant', { numeric: true });
  });
  RAGIC_STATE.page = 1;
  renderTable();
  updateColumnMenuStates();
};

const handleMenuAction = (item) => {
  const key = item.dataset.field;
  const action = item.dataset.menuAction;
  if (action === 'clear-filter') {
    delete RAGIC_STATE.filters[key];
    item.parentElement.querySelectorAll('[data-menu-option]').forEach((checkbox) => { checkbox.checked = false; });
    const input = item.parentElement.querySelector('[data-menu-filter]');
    if (input) input.value = '';
    closeAllMenus();
    applyFilters();
    return;
  }
  if (action === 'sort-asc' || action === 'sort-desc') {
    closeAllMenus();
    sortByField(key, action === 'sort-asc' ? 'asc' : 'desc');
  }
  };

const handleColumnMenuClick = (event) => {
  const trigger = event.target.closest('.col-menu-trigger');
  if (trigger) {
    event.preventDefault();
    event.stopPropagation();
    toggleColumnMenu(trigger.dataset.field);
    return;
  }
  
  const action = event.target.closest('[data-menu-action]');
  if (action) {
    event.preventDefault();
    event.stopPropagation();
    handleMenuAction(action);
    return;
  }

  if (event.target.closest('.col-menu-dropdown')) return;
  closeAllMenus();
};

const handleColumnMenuInput = (event) => {
  const input = event.target.closest('[data-menu-filter]');
  if (!input) return;
  RAGIC_STATE.filters[input.dataset.menuFilter] = input.value;
  applyFilters();
};

const handleColumnMenuChange = (event) => {
  const checkbox = event.target.closest('[data-menu-option]');
  if (!checkbox) return;
  const key = checkbox.dataset.menuOption;
  const selected = [...checkbox.closest('.col-menu-dropdown').querySelectorAll('[data-menu-option]')]
    .filter((item) => item.dataset.menuOption === key && item.checked)
    .map((item) => item.value);
  if (selected.length) RAGIC_STATE.filters[key] = selected;
  else delete RAGIC_STATE.filters[key];
  applyFilters();
};

const renderColumnFilterControls = (field) => {
  const key = escapeHtml(field.key);
  const current = normalizeFilterValue(RAGIC_STATE.filters[field.key]);
  if (isSelectFilterField(field)) {
    return optionList(field).map((option) => {
      const checked = Array.isArray(current) && current.includes(option) ? ' checked' : '';
      return `<label class="menu-item menu-checkbox"><input type="checkbox" data-menu-option="${key}" value="${escapeHtml(option)}"${checked}><span>${escapeHtml(option)}</span></label>`;
    }).join('');
  }
  return `<div class="col-filter-box"><input type="text" data-menu-filter="${key}" placeholder="輸入關鍵字..." value="${escapeHtml(current)}" /></div>`;
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
  if (table) {
    table.style.tableLayout = 'auto';
    applyRagicColumnGroup(table);
  }
  document.querySelector('#ragicFilterRow')?.remove();
  headerRow.innerHTML = `<th class="icon-actions-head col-marker">標記</th>` + listFields().map((field) => {
    const key = escapeHtml(field.key);
    const label = escapeHtml(field.label || field.key);
    const width = fieldColumnWidth(field);
    const style = columnWidthStyle(width);
    return `<th class="${ragicColumnClass(field)}${field.type === 'textarea' ? ' col-textarea' : ''} col-menu-cell" data-type="${escapeHtml(field.type || '')}" data-field-key="${key}"${style}><span class="col-label">${label}</span><span class="col-menu-trigger" data-field="${key}" role="button" tabindex="0" aria-label="開啟${label}欄位選單">▼</span><span class="col-sort-indicator"></span><div class="col-menu-dropdown" data-menu="${key}" hidden><div class="menu-item" data-menu-action="sort-asc" data-field="${key}">↑ <span>從A到Z排序</span></div><div class="menu-item" data-menu-action="sort-desc" data-field="${key}">↓ <span>從Z到A排序</span></div><div class="menu-item" data-menu-action="clear-filter" data-field="${key}">✕ <span>清除篩選條件</span></div><div class="menu-divider"></div>${renderColumnFilterControls(field)}</div></th>`;
  }).join('');
  listFields().forEach((field) => {
    applyColumnWidth(headerRow.querySelector(`[data-menu="${CSS.escape(field.key)}"]`)?.closest('th'), fieldColumnWidth(field));
  });
  attachColumnResizers(headerRow);
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
  if (!handle) return;
  let handlePressed = false;
  row.setAttribute('draggable', 'true');
  handle.addEventListener('mousedown', () => { handlePressed = true; });
  handle.addEventListener('touchstart', () => { handlePressed = true; }, { passive: true });
  row.addEventListener('dragstart', function(e) {
    e.stopPropagation();
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
    e.stopPropagation();
    if (!draggedDesignerField || draggedDesignerField.parentElement !== this.parentElement) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
  });
  row.addEventListener('dragleave', function(e) {
    e.stopPropagation();
    this.classList.remove('drag-over');
  });
  row.addEventListener('drop', function(e) {
    e.stopPropagation();
    e.preventDefault();
    moveDesignerField(draggedDesignerField, this);
    this.classList.remove('drag-over');
    updateDesignerPreview();
  });
  row.addEventListener('dragend', function(e) {
    e.stopPropagation();
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
    return `<col${width ? ` style="min-width: ${width}px !important; width: ${width}px;"` : ''}>`;
  }).join('');
  const headers = fields.map((field) => `<th class="${ragicColumnClass(field)}">${escapeHtml(field.label || field.key)}</th>`).join('');
  const rows = [0, 1, 2].map((rowIndex) => `<tr>${fields.map((field) => `<td class="${ragicColumnClass(field)}">${escapeHtml(designerPreviewValue(field, rowIndex))}</td>`).join('')}</tr>`).join('');
  preview.innerHTML = `<table class="ragic-table">${colgroup ? `<colgroup>${colgroup}</colgroup>` : ''}<thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  const previewTable = preview.querySelector('.ragic-table');
  fields.forEach((field, index) => {
    const width = fieldColumnWidth(field);
    applyColumnWidth(previewTable?.querySelector(`thead th:nth-child(${index + 1})`), width);
    previewTable?.querySelectorAll(`tbody td:nth-child(${index + 1})`).forEach((cell) => applyColumnWidth(cell, width));
  });
};
const SUBFIELD_TYPES = [
  { value: 'text', label: '文字' },
  { value: 'textarea', label: '多行文字' },
  { value: 'date', label: '日期' },
  { value: 'image', label: '圖片' },
  { value: 'file', label: '檔案' },
  { value: 'link', label: '連結' }
];


const subfieldWidthSummary = (container) => {
  const rows = [...(container?.querySelectorAll(':scope > .designer-field') || [])];
  const widths = rows.map((row) => normalizeFieldWidth(row.querySelector('[data-role="width"]')?.value));
  const total = widths.reduce((sum, width) => sum + (width || 0), 0);
  return { total, count: rows.length, complete: rows.length > 0 && widths.every(Boolean) };
};
const refreshSubfieldWidthSummary = (scope = document) => {
  scope.querySelectorAll('.designer-subfields, .setting-subtable-fields').forEach((section) => {
    const list = section.querySelector('.designer-subfield-list');
    const badge = section.querySelector('[data-subfield-total-width]');
    if (!list || !badge) return;
    const { total, count, complete } = subfieldWidthSummary(list);
    badge.textContent = complete ? `欄框總寬度：${total}px` : `欄框總寬度：${count ? `${total}px（尚有自動欄寬）` : '0px'}`;
    badge.classList.toggle('is-complete', complete);
  });
};
const syncSubtableParentWidth = (subfieldList) => {
  const section = subfieldList?.closest('.designer-subfields, .setting-subtable-fields');
  const { total, complete } = subfieldWidthSummary(subfieldList);
  if (!complete || !total) return;
  if (section?.classList.contains('designer-subfields')) {
    const parentRow = section.closest('.designer-field');
    const widthInput = parentRow?.querySelector(':scope > .designer-width [data-role="width"]');
    if (widthInput) widthInput.value = total;
  } else if (section?.classList.contains('setting-subtable-fields')) {
    const layoutWidth = section.closest('#layoutFieldSettingsPanel')?.querySelector('[data-layout-width]');
    if (layoutWidth) layoutWidth.value = total;
  }
};
const syncSubtableWidthFromEvent = (target) => {
  const list = target?.closest?.('.designer-subfield-list');
  if (list) syncSubtableParentWidth(list);
  refreshSubfieldWidthSummary(target?.closest?.('.designer-subfields, .setting-subtable-fields') || document);
};

const fieldDesigner = (field = {}, nested = false) => {
  const row = document.createElement('div');
  row.className = `designer-field field-row${nested ? ' designer-subfield-row' : ''}`;
  row.dataset.key = shouldRegenerateFieldKey(field.key) ? generateFieldKey() : field.key;
  row.dataset.fieldKey = row.dataset.key;
  if (field.linkedHandover) row.dataset.linkedHandover = '1';
  
  if (nested) {
    const subfieldType = SUBFIELD_TYPES.some((type) => type.value === field.type) ? field.type : 'text';
    const typeOptions = SUBFIELD_TYPES.map((type) => `<option value="${type.value}" ${subfieldType === type.value ? 'selected' : ''}>${type.label}</option>`).join('');
    row.innerHTML = `<span class="drag-handle" title="拖拉排序" aria-label="拖拉排序">⠿</span><input data-role="label" placeholder="子欄位名稱" value="${escapeHtml(field.label || '')}"><select data-role="type">${typeOptions}</select><label class="designer-width"><span>寬度</span><input data-role="width" type="number" min="1" step="1" inputmode="numeric" placeholder="自動" value="${escapeHtml(normalizeFieldWidth(field.width) ?? '')}"><span>px</span></label><div class="designer-actions"><button class="ghost danger" data-remove type="button">刪除</button></div>`;
    row.addEventListener('click', (event) => {
      if (event.target.matches('[data-remove]')) {
        event.stopPropagation();
        const list = row.parentElement;
        row.remove();
        syncSubtableWidthFromEvent(list);
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
  row.innerHTML = `<span class="drag-handle" title="拖拉排序" aria-label="拖拉排序">⠿</span><input data-role="label" placeholder="欄位名稱" value="${escapeHtml(field.label || '')}"><select data-role="type">${typeOptions}${legacy}</select><textarea data-role="options" placeholder="選項，每行一個">${escapeHtml(optionList(field).join('\n'))}</textarea><label class="designer-required"><input data-role="required" type="checkbox" ${field.required ? 'checked' : ''}> 必填</label><label class="designer-width"><span>寬度</span><input data-role="width" type="number" min="1" step="1" inputmode="numeric" placeholder="自動" value="${escapeHtml(normalizeFieldWidth(field.width) ?? '')}"><span>px</span></label><div class="designer-form-layout" aria-label="表單排版"><label><span>列</span><input data-role="form-row" type="number" min="1" step="1" inputmode="numeric" placeholder="自動" value="${escapeHtml(normalizeFormLayoutNumber(field.formRow) ?? '')}"></label><label><span>欄</span><input data-role="form-col" type="number" min="1" max="4" step="1" inputmode="numeric" placeholder="自動" value="${escapeHtml(normalizeFormLayoutNumber(field.formCol, { max: 4 }) ?? '')}"></label><label><span>跨欄</span><input data-role="form-colspan" type="number" min="1" max="4" step="1" inputmode="numeric" value="${escapeHtml(normalizeFormLayoutNumber(field.formColSpan, { max: 4, fallback: 1 }))}"></label></div><input data-role="default" type="hidden" value="${escapeHtml(field.defaultValue || '')}"><input data-role="help" type="hidden" value="${escapeHtml(field.help || '')}"><input data-role="readonly" type="hidden" value="${field.readonly ? '1' : ''}"><input data-role="hidden" type="hidden" value="${field.hidden ? '1' : ''}"><div class="designer-actions"><button class="ghost danger" data-remove type="button">刪除</button></div><div class="designer-subfields"><div class="designer-subfields-head"><h4>子欄位設定</h4><span class="designer-subfield-total" data-subfield-total-width>欄框總寬度：0px</span><label class="designer-columns-per-row"><span>每列顯示</span><input data-role="columns-per-row" type="number" min="1" max="10" step="1" inputmode="numeric" value="${escapeHtml(normalizeSubtableColumnsPerRow(field.columnsPerRow))}"><span>個欄位</span></label></div><div class="designer-subfield-list"></div><button class="secondary" data-add-subfield type="button">+ 新增子欄位</button></div>`;
  const sub = row.querySelector('.designer-subfields');
  const subList = row.querySelector('.designer-subfield-list');
  const sync = () => { sub.hidden = row.querySelector('[data-role="type"]').value !== 'subtable'; };
  (field.fields || []).forEach((child) => subList.appendChild(fieldDesigner(child, true)));
  row.addEventListener('click', (event) => {
    if (event.target.matches('[data-remove]') && event.target.closest('.designer-field') === row) {
      const list = row.parentElement;
      row.remove();
      syncSubtableWidthFromEvent(list);
      updateDesignerPreview();
    }
    if (event.target.matches('[data-add-subfield]')) {
      event.stopPropagation();
      subList.appendChild(fieldDesigner({ key: generateFieldKey(), label: '新子欄位', type: 'text' }, true));
      syncSubtableWidthFromEvent(subList);
      updateDesignerPreview();
    }
  });
  row.querySelector('[data-role="type"]').addEventListener('change', () => {
    sync();
    updateDesignerPreview();
  });
  enableDesignerDrag(row);
  sync();
  refreshSubfieldWidthSummary(row);
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
    options: (row.querySelector('[data-role="options"]')?.value || '').split('\n').map((v) => v.trim()).filter(Boolean),
    defaultValue: row.querySelector('[data-role="default"]')?.value || '',
    help: row.querySelector('[data-role="help"]')?.value || '',
    readonly: row.querySelector('[data-role="readonly"]')?.value === '1',
    hidden: row.querySelector('[data-role="hidden"]')?.value === '1'
  };
  if (row.dataset.linkedHandover === '1') field.linkedHandover = true;
  const formRow = normalizeFormLayoutNumber(row.querySelector('[data-role="form-row"]')?.value);
  const formCol = normalizeFormLayoutNumber(row.querySelector('[data-role="form-col"]')?.value, { max: 4 });
  const formColSpan = normalizeFormLayoutNumber(row.querySelector('[data-role="form-colspan"]')?.value, { max: 4, fallback: 1 });
  if (formRow) field.formRow = formRow;
  if (formCol) field.formCol = formCol;
  if (formColSpan !== 1 || formRow || formCol) field.formColSpan = formColSpan;
  if (type === 'subtable') {
    field.columnsPerRow = normalizeSubtableColumnsPerRow(row.querySelector('[data-role="columns-per-row"]')?.value);
    field.fields = readDesigner(row.querySelector('.designer-subfield-list'));
  }
  return field;
});


const designerFieldRowsFromModal = () => [...document.querySelectorAll('#ragicDesignerModal .designer-body > .designer-field')];
const currentDesignerLayout = () => normalizeDesignerFormLayout(RAGIC_STATE.schema?.formLayout, readDesigner(document.querySelector('#ragicDesignerModal .designer-body') || document.createElement('div')));
const placedLayoutKeys = (layout) => new Set(Object.keys(layout.fields || {}));
const layoutCellsOverlap = (a, b) => a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row && a.col < b.col + b.colSpan && a.col + a.colSpan > b.col;
const isLayoutAreaFree = (layout, fieldKey, candidate) => !Object.entries(layout.fields || {}).some(([key, item]) => key !== fieldKey && layoutCellsOverlap(candidate, item));
const layoutFieldTypeLabel = (type = 'text') => FIELD_TYPES.find((item) => item.value === type)?.label || LEGACY_FIELD_TYPES.find((item) => item.value === type)?.label || type;
const clampLayoutItem = (item = {}, layout = {}) => {
  const columns = layout.columns || 5;
  const rows = layout.rows || 4;
  const row = normalizeFormLayoutNumber(item.row, { min: 1, max: rows, fallback: 1 });
  const col = normalizeFormLayoutNumber(item.col ?? item.column, { min: 1, max: columns, fallback: 1 });
  return {
    row,
    col,
    colSpan: normalizeFormLayoutNumber(item.colSpan ?? item.columnSpan, { min: 1, max: columns - col + 1, fallback: 1 }),
    rowSpan: normalizeFormLayoutNumber(item.rowSpan, { min: 1, max: rows - row + 1, fallback: 1 }),
    width: normalizeFormLayoutNumber(item.width, { min: 40, max: 2000, fallback: null }),
    height: normalizeFormLayoutNumber(item.height, { min: 32, max: 2000, fallback: null })
  };
};
const getLayoutCellMetrics = (grid) => {
  const rect = grid.getBoundingClientRect();
  const styles = getComputedStyle(grid);
  const gapX = Number.parseFloat(styles.columnGap) || 0;
  const gapY = Number.parseFloat(styles.rowGap) || 0;
  return { rect, gapX, gapY, cellW: (rect.width - gapX * ((Number(grid.dataset.columns) || 1) - 1)) / (Number(grid.dataset.columns) || 1), cellH: (rect.height - gapY * ((Number(grid.dataset.rows) || 1) - 1)) / (Number(grid.dataset.rows) || 1) };
};
const layoutSpanWidth = (grid, colSpan = 1) => {
  if (!grid) return null;
  const metrics = getLayoutCellMetrics(grid);
  const span = normalizeFormLayoutNumber(colSpan, { min: 1, max: Number(grid.dataset.columns) || 1, fallback: 1 });
  const width = (metrics.cellW * span) + (metrics.gapX * Math.max(0, span - 1));
  return Number.isFinite(width) && width > 0 ? Math.round(width) : null;
};
const refreshLayoutWidthHint = (panel = document.querySelector('#layoutFieldSettingsPanel')) => {
  const hint = panel?.querySelector('[data-layout-width-hint]');
  if (!hint) return;
  const explicitWidth = normalizeFieldWidth(panel.querySelector('[data-layout-width]')?.value);
  if (explicitWidth) {
    hint.textContent = `目前套用寬度：${explicitWidth}px`;
    return;
  }
  const grid = document.querySelector('#layoutDesignerPanel .layout-grid');
  const colSpan = panel.querySelector('[data-layout-colspan]')?.value || 1;
  const spanWidth = layoutSpanWidth(grid, colSpan);
  hint.textContent = spanWidth ? `跨欄 ${colSpan} 欄約 ${spanWidth}px` : '跨欄寬度會依目前畫布寬度計算';
};
const renderLayoutDesigner = () => {
  const modal = document.querySelector('#ragicDesignerModal');
  const panel = modal?.querySelector('#layoutDesignerPanel');
  const body = modal?.querySelector('.designer-body');
  if (!panel || !body) return;
  const fields = readDesigner(body);
  const layout = normalizeDesignerFormLayout(RAGIC_STATE.schema?.formLayout, fields);
  const fixedLogLayout = false;
  const rowsSelect = [...Array(10)].map((_, i) => i + 1).map((n) => `<option value="${n}" ${layout.rows === n ? 'selected' : ''}>${n}</option>`).join('');
  const colsSelect = [...Array(10)].map((_, i) => i + 1).map((n) => `<option value="${n}" ${layout.columns === n ? 'selected' : ''}>${n}</option>`).join('');
  const placed = placedLayoutKeys(layout);
  const gridLines = [];
  for (let row = 1; row <= layout.rows; row += 1) for (let col = 1; col <= layout.columns; col += 1) gridLines.push(`<div class="layout-grid-slot" data-row="${row}" data-col="${col}" style="grid-column:${col};grid-row:${row};"></div>`);
  const placedFields = fields.filter((field) => placed.has(field.key)).map((field) => {
    const item = layout.fields[field.key];
    const fixedLogField = fixedLogLayout && Boolean(logFieldLayoutFor(field));
    const size = `${item.width ? `width:${item.width}px;` : ''}${item.height ? `height:${item.height}px;min-height:${item.height}px;` : ''}`;
    return `<div class="layout-field ${field.type === 'subtable' ? 'layout-field-subtable' : ''}" draggable="${fixedLogField ? 'false' : 'true'}" data-field-key="${escapeHtml(field.key)}" style="grid-column:${item.col} / span ${item.colSpan};grid-row:${item.row} / span ${item.rowSpan};${size}"><b>${escapeHtml(field.label || field.key)}</b><small>${escapeHtml(layoutFieldTypeLabel(field.type))}</small>${field.type === 'subtable' ? '<button class="subtable-edit-btn" type="button">編輯子表格</button>' : ''}<button class="settings-btn" type="button" title="設定">⚙️</button>${fixedLogField ? '' : '<button class="remove-btn" type="button" title="移除">×</button><span class="resize-handle-right" data-resize="col"></span><span class="resize-handle-bottom" data-resize="row"></span><span class="resize-handle-corner" data-resize="both"></span>'}</div>`;
  }).join('');
  const unplaced = fields.filter((field) => !placed.has(field.key)).map((field) => `<div class="layout-field-chip ${field.type === 'subtable' ? 'layout-field-chip-subtable' : ''}" draggable="true" data-field-key="${escapeHtml(field.key)}"><span class="layout-chip-grip">⠿</span><b>${escapeHtml(field.label || field.key)}</b><small>${escapeHtml(layoutFieldTypeLabel(field.type))}</small><button class="settings-btn" type="button" aria-label="編輯欄位">⚙️</button><button class="remove-btn" type="button" aria-label="移除欄位">×</button></div>`).join('') || '<span class="layout-empty">全部欄位都已放置</span>';
  const fieldTypeButtons = FIELD_TYPES.map((type) => `<button class="layout-type-button" data-add-layout-field data-field-type="${escapeHtml(type.value)}" type="button"><span>${escapeHtml(type.label)}</span></button>`).join('');
  panel.innerHTML = `<div class="layout-designer"><div class="layout-toolbar"><div class="layout-toolbar-controls"><label>欄數：<select id="gridCols" ${fixedLogLayout ? 'disabled' : ''}>${colsSelect}</select></label><label>列數：<select id="gridRows" ${fixedLogLayout ? 'disabled' : ''}>${rowsSelect}</select></label></div></div><div class="layout-unplaced"><span class="layout-section-label">未放置的欄位：</span><div class="layout-unplaced-fields">${unplaced}</div></div><div class="layout-workbench"><main class="layout-canvas"><div class="layout-grid-section"><h3>排版表格（拖曳欄位到表格中，可調整大小、跨欄跨列） 欄框設置131x48</h3><div class="layout-grid" data-columns="${layout.columns}" data-rows="${layout.rows}" aria-label="排版表格拖曳區" style="grid-template-columns:repeat(${layout.columns}, 131px);grid-template-rows:repeat(${layout.rows}, 48px);">${gridLines.join('')}${placedFields}</div></div></main><aside class="layout-side-panel"><section class="layout-add-card"><h3>新增欄位</h3><p>選擇欄位類型</p><div class="layout-type-grid">${fieldTypeButtons}</div></section><aside id="layoutFieldSettingsPanel" class="layout-field-settings"><div class="layout-settings-empty">請點選欄位以編輯屬性</div></aside></aside></div></div>`;
};
const updateDesignerFieldByKey = (fieldKey, patcher) => {
  const escapedKey = window.CSS?.escape ? CSS.escape(fieldKey) : String(fieldKey).replace(/\"/g, '\\\"');
  const row = document.querySelector(`#ragicDesignerModal .designer-body > .designer-field[data-field-key="${escapedKey}"], #ragicDesignerModal .designer-body > .designer-field[data-key="${escapedKey}"]`);
  if (!row) return;
  patcher(row);
  updateDesignerPreview();
  renderLayoutDesigner();
};

const typeSelectOptions = (selected = 'text') => FIELD_TYPE_GROUPS.map((group) => `<optgroup label="${escapeHtml(group.label)}">${group.types.map((type) => `<option value="${escapeHtml(type.value)}" ${selected === type.value ? 'selected' : ''}>${escapeHtml(type.label)}</option>`).join('')}</optgroup>`).join('');
const removeDesignerFieldByKey = (fieldKey) => {
  const escapedKey = window.CSS?.escape ? CSS.escape(fieldKey) : String(fieldKey).replace(/\"/g, '\\\"');
  const row = document.querySelector(`#ragicDesignerModal .designer-body > .designer-field[data-field-key="${escapedKey}"], #ragicDesignerModal .designer-body > .designer-field[data-key="${escapedKey}"]`);
  if (!row) return false;
  row.remove();
  updateDesignerPreview();
  return true;
};

const openLayoutFieldSettings = (fieldKey) => {
  const field = readDesigner(document.querySelector('#ragicDesignerModal .designer-body') || document.createElement('div')).find((item) => item.key === fieldKey);
  const layout = currentDesignerLayout();
  if (!field) return;
  const item = layout.fields[fieldKey] || { row: 0, col: 0, colSpan: 1, rowSpan: 1 };
  let panel = document.querySelector('#layoutFieldSettingsPanel');
  if (!panel) return;
  const options = optionList(field).join('\n');
  const linkedHandoverCheck = isLogModule() ? `<label class="setting-linked-handover"><input data-setting-linked-handover type="checkbox" ${field.linkedHandover ? 'checked' : ''}> 連接交接</label>` : '';
  panel.innerHTML = `<h3>欄位屬性設定</h3><label>欄位名稱<input data-setting-label value="${escapeHtml(field.label || '')}"></label><label>欄位類型<select data-setting-type>${typeSelectOptions(field.type)}</select></label>${linkedHandoverCheck}<div class="setting-options" ${['select','multiselect'].includes(field.type) ? '' : 'hidden'}><span>選項:</span><textarea data-option-list data-option rows="7" placeholder="每行一個選項">${escapeHtml(options)}</textarea></div><input data-setting-default type="hidden" value="${escapeHtml(field.defaultValue || '')}"><input data-setting-help type="hidden" value="${escapeHtml(field.help || '')}"><input data-layout-row type="hidden" value="${escapeHtml(item.row || 1)}"><input data-layout-col type="hidden" value="${escapeHtml(item.col || 1)}"><input data-layout-rowspan type="hidden" value="${escapeHtml(item.rowSpan || 1)}"><input data-layout-colspan type="hidden" value="${escapeHtml(item.colSpan || 1)}"><input data-layout-width type="hidden" value="${escapeHtml(item.width || field.formWidth || '')}"><input data-layout-height type="hidden" value="${escapeHtml(layoutHeightValue(item, field))}"><input data-setting-required type="hidden" value="${field.required ? '1' : ''}"><input data-setting-readonly type="hidden" value="${field.readonly ? '1' : ''}"><input data-setting-hidden type="hidden" value="${field.hidden ? '1' : ''}">${field.type === 'subtable' ? '<section class="setting-subtable-fields"><div class="designer-subfields-head"><h4>子欄位設定</h4><span class="designer-subfield-total" data-subfield-total-width>欄框總寬度：0px</span><label class="designer-columns-per-row"><span>每列顯示</span><input data-setting-columns-per-row type="number" min="1" max="10" step="1" inputmode="numeric" value="' + escapeHtml(normalizeSubtableColumnsPerRow(field.columnsPerRow)) + '"><span>個欄位</span></label></div><div class="designer-subfield-list" data-setting-subfields></div><button class="secondary" data-add-setting-subfield type="button">+ 新增子欄位</button></section>' : ''}<div class="layout-settings-actions"><button class="primary btn-save-layout" data-confirm-settings type="button">確認並儲存</button><button class="danger" data-remove-settings-field type="button">刪除欄位</button></div>`;
  panel.hidden = false;
  panel.dataset.fieldKey = fieldKey;
  const subfieldList = panel.querySelector('[data-setting-subfields]');
  if (subfieldList) (field.fields || []).forEach((child) => subfieldList.appendChild(fieldDesigner(child, true)));
  refreshSubfieldWidthSummary(panel);
  refreshLayoutWidthHint(panel);
};

const autoLayoutFields = (layout, fields) => {
  layout.fields = {};
  let row = 1;
  let col = 1;
  const normal = fields.filter((field) => field.type !== 'subtable');
  normal.forEach((field) => {
    layout.fields[field.key] = { row, col, colSpan: 1, rowSpan: 1 };
    col += 1;
    if (col > layout.columns) { col = 1; row += 1; }
  });
  if (fields.some((field) => field.type === 'subtable')) { if (col !== 1) row += 1; fields.filter((field) => field.type === 'subtable').forEach((field) => { layout.fields[field.key] = { row, col: 1, colSpan: layout.columns, rowSpan: 1, height: defaultFormFieldHeight(field) }; row += 1; }); }
  layout.rows = Math.min(10, Math.max(layout.rows, row));
};

const updateLayoutDesignerState = (patcher) => {
  const body = document.querySelector('#ragicDesignerModal .designer-body');
  const fields = readDesigner(body || document.createElement('div'));
  const layout = normalizeDesignerFormLayout(RAGIC_STATE.schema?.formLayout, fields);
  patcher(layout, fields);
  RAGIC_STATE.schema = { ...(RAGIC_STATE.schema || {}), fields: normalizeFields(fields), formLayout: normalizeDesignerFormLayout(layout, fields) };
  renderLayoutDesigner();
};
const attachLayoutDesignerEvents = (panel) => {
  if (!panel || panel.dataset.layoutEventsBound === 'true') return;
  panel.dataset.layoutEventsBound = 'true';
  let dragKey = '';
  const candidateFromPoint = (grid, x, y, start = {}) => {
    const m = getLayoutCellMetrics(grid);
    const col = Math.min(Number(grid.dataset.columns), Math.max(1, Math.floor((x - m.rect.left) / (m.cellW + m.gapX)) + 1));
    const row = Math.min(Number(grid.dataset.rows), Math.max(1, Math.floor((y - m.rect.top) / (m.cellH + m.gapY)) + 1));
    return clampLayoutItem({ ...start, row, col }, currentDesignerLayout());
  };
  panel.addEventListener('dragstart', (event) => {
    const item = event.target.closest('[data-field-key]');
    if (!item || event.target.closest('[data-resize], .remove-btn, .settings-btn')) return;
    dragKey = item.dataset.fieldKey;
    event.dataTransfer.setData('text/plain', dragKey);
    item.classList.add('is-dragging');
  });
  panel.addEventListener('dragover', (event) => {
    const grid = event.target.closest('.layout-grid');
    if (!grid) return;
    event.preventDefault();
    const key = event.dataTransfer.getData('text/plain') || dragKey;
    const layout = currentDesignerLayout();
    const current = layout.fields[key] || { colSpan: 1, rowSpan: 1 };
    const candidate = candidateFromPoint(grid, event.clientX, event.clientY, current);
    grid.querySelector('.layout-drop-preview')?.remove();
    const preview = document.createElement('div');
    preview.className = `layout-drop-preview ${isLayoutAreaFree(layout, key, candidate) ? 'is-valid' : 'is-invalid'}`;
    preview.style.cssText = `grid-column:${candidate.col} / span ${candidate.colSpan};grid-row:${candidate.row} / span ${candidate.rowSpan};`;
    grid.appendChild(preview);
  });
  panel.addEventListener('dragleave', (event) => { if (!event.relatedTarget || !panel.contains(event.relatedTarget)) panel.querySelector('.layout-drop-preview')?.remove(); });
  panel.addEventListener('drop', (event) => {
    const grid = event.target.closest('.layout-grid');
    const key = event.dataTransfer.getData('text/plain') || dragKey;
    if (!grid || !key) return;
    event.preventDefault();
    panel.querySelector('.layout-drop-preview')?.remove();
    updateLayoutDesignerState((layout) => {
      const current = layout.fields[key] || { colSpan: 1, rowSpan: 1 };
      const candidate = candidateFromPoint(grid, event.clientX, event.clientY, current);
      if (isLayoutAreaFree(layout, key, candidate)) layout.fields[key] = candidate;
    });
  });
  panel.addEventListener('dragend', () => { dragKey = ''; panel.querySelector('.layout-drop-preview')?.remove(); panel.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging')); });
  panel.addEventListener('click', (event) => {
    const remove = event.target.closest('.remove-btn');
    if (remove) {
      const key = remove.closest('[data-field-key]')?.dataset.fieldKey;
      if (!key || !confirm('確定刪除此欄位？')) return;
      removeDesignerFieldByKey(key);
      updateLayoutDesignerState((layout) => { delete layout.fields[key]; });
      return;
    }
    if (event.target.closest('.btn-preview-layout')) panel.querySelector('.layout-preview')?.scrollIntoView({ block: 'nearest' });
  });
  panel.addEventListener('change', (event) => {
    if (!event.target.matches('#gridCols, #gridRows')) return;
    updateLayoutDesignerState((layout) => {
      layout.columns = Number(panel.querySelector('#gridCols').value);
      layout.rows = Number(panel.querySelector('#gridRows').value);
      Object.entries(layout.fields || {}).forEach(([key, item]) => {
        const next = clampLayoutItem(item, layout);
        if (isLayoutAreaFree(layout, key, next)) layout.fields[key] = next;
        else delete layout.fields[key];
      });
    });
  });
  panel.addEventListener('pointerdown', (event) => {
    const source = event.target.closest('.layout-field-chip, .layout-field');
    if (!source || event.target.closest('[data-resize], .remove-btn, .settings-btn, button, input, select, textarea')) return;
    if (source.getAttribute('draggable') === 'false') return;
    const fieldKey = source.dataset.fieldKey;
    if (!fieldKey) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const beginDragDistance = 4;
    let pointerDragging = false;
    const cleanupPreview = () => panel.querySelector('.layout-drop-preview')?.remove();
    const showPreview = (clientX, clientY) => {
      const grid = document.elementFromPoint(clientX, clientY)?.closest?.('.layout-grid');
      cleanupPreview();
      if (!grid || !panel.contains(grid)) return null;
      const layout = currentDesignerLayout();
      const current = layout.fields[fieldKey] || { colSpan: 1, rowSpan: 1 };
      const candidate = candidateFromPoint(grid, clientX, clientY, current);
      const preview = document.createElement('div');
      preview.className = `layout-drop-preview ${isLayoutAreaFree(layout, fieldKey, candidate) ? 'is-valid' : 'is-invalid'}`;
      preview.style.cssText = `grid-column:${candidate.col} / span ${candidate.colSpan};grid-row:${candidate.row} / span ${candidate.rowSpan};`;
      grid.appendChild(preview);
      return { grid, layout, candidate };
    };
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const moved = Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY);
      if (!pointerDragging && moved < beginDragDistance) return;
      pointerDragging = true;
      moveEvent.preventDefault();
      dragKey = fieldKey;
      source.classList.add('is-dragging');
      showPreview(moveEvent.clientX, moveEvent.clientY);
    };
    const up = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      panel.releasePointerCapture?.(pointerId);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      source.classList.remove('is-dragging');
      if (pointerDragging) {
        upEvent.preventDefault();
        const result = showPreview(upEvent.clientX, upEvent.clientY);
        cleanupPreview();
        if (result?.grid && isLayoutAreaFree(result.layout, fieldKey, result.candidate)) {
          updateLayoutDesignerState((layout) => { layout.fields[fieldKey] = result.candidate; });
        }
      }
      dragKey = '';
    };
    const cancel = () => {
      panel.releasePointerCapture?.(pointerId);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      source.classList.remove('is-dragging');
      cleanupPreview();
      dragKey = '';
    };
    panel.setPointerCapture?.(pointerId);
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
  });
  panel.addEventListener('mousedown', (event) => {
    const handle = event.target.closest('[data-resize]');
    if (!handle) return;
    event.preventDefault();
    const fieldKey = handle.closest('[data-field-key]').dataset.fieldKey;
    const startX = event.pageX, startY = event.pageY, type = handle.dataset.resize;
    const start = { ...currentDesignerLayout().fields[fieldKey] };
    const grid = panel.querySelector('.layout-grid');
    const metrics = getLayoutCellMetrics(grid);
    const move = (moveEvent) => {
      const dCol = Math.round((moveEvent.pageX - startX) / Math.max(1, metrics.cellW + metrics.gapX));
      const dRow = Math.round((moveEvent.pageY - startY) / Math.max(1, metrics.cellH + metrics.gapY));
      updateLayoutDesignerState((layout) => {
        const next = { ...start };
        if (type === 'col' || type === 'both') next.colSpan = Math.min(layout.columns - next.col + 1, Math.max(1, start.colSpan + dCol));
        if (type === 'row' || type === 'both') next.rowSpan = Math.min(layout.rows - next.row + 1, Math.max(1, start.rowSpan + dRow));
        if (isLayoutAreaFree(layout, fieldKey, next)) layout.fields[fieldKey] = next;
      });
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
};

const openDesigner = async () => { const modal = document.querySelector('#ragicDesignerModal'); const body = modal.querySelector('.designer-body'); body.innerHTML = ''; getFields().forEach((field) => body.appendChild(fieldDesigner(field))); modal.hidden = false; renderLayoutDesigner(); updateDesignerPreview(); };
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

const normalizedFieldIdentity = (field = {}) => `${String(field.label || '').trim()}::${String(field.type || 'text').trim()}`;
const handoverSchemaFallback = () => makeDefaultSchema({
  title: '交接',
  collection: 'workHandover',
  fields: [
    { key: 'date', label: '日期', type: 'date', defaultToday: true },
    { key: 'shift', label: '班別', type: 'select', options: ['早班', '晚班'] },
    { key: 'department', label: '部門', type: 'text' },
    { key: 'category', label: '分類', type: 'text' },
    { key: 'status', label: '狀態', type: 'select', options: ['已完成', '處理中', '必看⚠️'] },
    { key: 'item', label: '交接事項', type: 'textarea' },
    { key: 'note', label: '備註', type: 'textarea' },
    { key: 'publisher', label: '建立者', type: 'text' },
    { key: 'finisher', label: '完成者', type: 'text' },
    { key: 'link', label: '連結', type: 'link' },
    { key: 'serial', label: '編號', type: 'serial' },
    { key: 'attachment', label: '檔案', type: 'file' },
    { key: 'image', label: '圖片', type: 'image' }
  ]
});

const loadHandoverFieldsForLinking = async (db) => {
  const schemaCollection = SCHEMA_MAP.handover || 'handover_schema';
  try {
    const doc = await db.collection(schemaCollection).doc('active').get();
    const schema = doc.exists ? normalizeSchema(doc.data()) : handoverSchemaFallback();
    return schema.fields || [];
  } catch (error) {
    console.warn('讀取交接表格結構失敗，改用預設交接欄位。', error);
    return handoverSchemaFallback().fields || [];
  }
};

const syncLinkedHandoverFields = async ({ data = {}, logId = '' } = {}) => {
  if (!isLogModule() || !logId) return;
  const db = window.omniplayDb;
  if (!db) return;
  const linkedFields = getFields().filter((field) => field.linkedHandover);
  if (!linkedFields.length) return;
  const targetFields = await loadHandoverFieldsForLinking(db);
  const targetByIdentity = new Map(targetFields.map((field) => [normalizedFieldIdentity(field), field]));
  const linkedData = {};
  linkedFields.forEach((sourceField) => {
    const targetField = targetByIdentity.get(normalizedFieldIdentity(sourceField));
    if (!targetField || targetField.type === 'serial') return;
    if (data[sourceField.key] !== undefined) linkedData[targetField.key] = data[sourceField.key];
  });
  if (!Object.keys(linkedData).length) return;
  await db.collection(COLLECTION_MAP.workHandover || 'handover').doc(`log_${logId}`).set({
    ...linkedData,
    linkedLogId: logId,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
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
  RAGIC_STATE.config = { ...config, collection: dataCollectionName(config), schemaCollection: schemaCollectionName(config) }; document.body?.classList.toggle('is-log-module', isLogModule(RAGIC_STATE.config)); RAGIC_STATE.pageSize = Number(localStorage.getItem(ragicPageSizeKey())) || 50; const db = window.omniplayDb; const collection = db?.collection(RAGIC_STATE.config.collection); RAGIC_STATE.collection = collection; const schemaDoc = db?.collection(RAGIC_STATE.config.schemaCollection).doc('active'); RAGIC_STATE.schemaDoc = schemaDoc;
  window.toggleFire = async (docId) => { const doc = await collection.doc(docId).get(); await collection.doc(docId).update({ fire: !doc.data()?.fire }); };
  window.togglePin = async (docId) => {
    const currentUser = currentRagicUser();
    if (!currentUser) return alert('請先登入再使用個人釘選');
    const doc = await collection.doc(docId).get();
    await collection.doc(docId).update({ [`pins.${currentUser}`]: !doc.data()?.pins?.[currentUser] });
  };
  const saveDesignerSchema = async ({ close = false } = {}) => {
    if (!canUse('design')) return false;
    const designerBody = document.querySelector('.designer-body');
    if (!designerBody) return false;
    RAGIC_STATE.schema = { ...normalizeSchema({ fields: readDesigner(designerBody), formLayout: RAGIC_STATE.schema?.formLayout }), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (schemaDoc) await schemaDoc.set(RAGIC_STATE.schema, { merge: true });
    renderHeader();
    applyFilters();
    if (close) closeDesigner();
    return true;
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
  document.querySelector('body').insertAdjacentHTML('beforeend', '<div class="ragic-modal" id="ragicDesignerModal" hidden><div class="ragic-modal-card"><div class="ragic-form-toolbar"><h2>設計表格</h2><button class="ghost" id="closeDesignerButton" type="button">關閉</button></div><div class="designer-body" hidden></div><div id="layoutDesignerPanel"></div></div></div>');
  }
  if (!document.querySelector('#ragicImageModal')) {
    document.querySelector('body').insertAdjacentHTML('beforeend', '<div class="ragic-modal" id="ragicImageModal" hidden><div class="ragic-modal-card ragic-image-modal-card"><div class="ragic-form-toolbar"><h2>圖片</h2><button class="ghost" id="closeImageModalButton" type="button">關閉</button></div><img alt="放大圖片預覽"></div></div>');
  }
  document.querySelector('#designTableButton')?.addEventListener('click', openDesigner);
  document.querySelector('#closeDesignerButton')?.addEventListener('click', closeDesigner);
  document.querySelector('#closeImageModalButton')?.addEventListener('click', closeImagePreview);
  document.querySelector('#ragicImageModal')?.addEventListener('click', (event) => { if (event.target.id === 'ragicImageModal') closeImagePreview(); });
  document.querySelector('.designer-body')?.addEventListener('input', (event) => {
    updateDesignerPreview();
    renderLayoutDesigner();
    if (event.target?.matches('[data-role="width"]')) {
      syncSubtableWidthFromEvent(event.target);
      saveDesignerSchema();
    }
  });
  document.querySelector('#addFieldButton')?.addEventListener('click', () => { const body = document.querySelector('.designer-body'); body.appendChild(fieldDesigner({ key: generateFieldKey(), label: '新欄位', type: 'text' })); updateDesignerPreview(); renderLayoutDesigner(); });
  document.querySelector('#ragicDesignerModal')?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-designer-tab]');
    if (!tab) return;
    const mode = tab.dataset.designerTab;
    document.querySelectorAll('#ragicDesignerModal [data-designer-tab]').forEach((item) => item.classList.toggle('active', item === tab));
    document.querySelectorAll('#ragicDesignerModal [data-designer-panel]').forEach((panel) => { panel.hidden = panel.dataset.designerPanel !== mode; });
    document.querySelector('#addFieldButton')?.toggleAttribute('hidden', mode !== 'fields');
    if (mode === 'layout') renderLayoutDesigner();
  });
  attachLayoutDesignerEvents(document.querySelector('#layoutDesignerPanel'));
  
  document.querySelector('#layoutDesignerPanel')?.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-layout-field], .btn-add-layout-field');
    if (addButton) { const body = document.querySelector('.designer-body'); const type = addButton.dataset.fieldType || 'text'; const typeLabel = FIELD_TYPES.find((item) => item.value === type)?.label || '新欄位'; body.appendChild(fieldDesigner({ key: generateFieldKey(), label: typeLabel, type })); updateDesignerPreview(); renderLayoutDesigner(); return; }
    if (event.target.closest('.btn-auto-layout')) { if (!confirm('這會清除目前的排版，確定嗎？')) return; updateLayoutDesignerState(autoLayoutFields); return; }
    const settings = event.target.closest('.settings-btn, .layout-field');
    if (settings && !event.target.closest('.remove-btn, [data-resize]')) openLayoutFieldSettings(settings.closest('[data-field-key]')?.dataset.fieldKey);
  });
  document.querySelector('#ragicDesignerModal')?.addEventListener('click', (event) => {
    const panel = event.target.closest('#layoutFieldSettingsPanel');
    if (!panel) return;
    if (event.target.matches('[data-setting-type]')) panel.querySelector('.setting-options').hidden = !['select','multiselect'].includes(event.target.value);
    if (event.target.closest('[data-add-setting-subfield]')) { const list = panel.querySelector('[data-setting-subfields]'); list?.appendChild(fieldDesigner({ key: generateFieldKey(), label: '新子欄位', type: 'text' }, true)); syncSubtableWidthFromEvent(list); return; }
    if (event.target.closest('[data-remove-settings-field]')) { const key = panel.dataset.fieldKey; if (!confirm('確定刪除此欄位？')) return; removeDesignerFieldByKey(key); updateLayoutDesignerState((layout) => { delete layout.fields[key]; }); panel.hidden = true; return; }
    if (event.target.closest('[data-confirm-settings]')) { const key = panel.dataset.fieldKey; updateDesignerFieldByKey(key, (row) => { row.querySelector('[data-role="label"]').value = panel.querySelector('[data-setting-label]').value; row.querySelector('[data-role="type"]').value = panel.querySelector('[data-setting-type]').value; row.querySelector('[data-role="options"]').value = String(panel.querySelector('[data-option-list]')?.value || '').split(/\n+/).map((option) => option.trim()).filter(Boolean).join('\n'); row.querySelector('[data-role="required"]').checked = panel.querySelector('[data-setting-required]')?.checked || panel.querySelector('[data-setting-required]')?.value === '1' || false; row.querySelector('[data-role="width"]').value = panel.querySelector('[data-layout-width]')?.value || ''; row.querySelector('[data-role="default"]').value = panel.querySelector('[data-setting-default]')?.value || ''; row.querySelector('[data-role="help"]').value = panel.querySelector('[data-setting-help]')?.value || ''; row.querySelector('[data-role="readonly"]').value = panel.querySelector('[data-setting-readonly]')?.checked || panel.querySelector('[data-setting-readonly]')?.value === '1' ? '1' : ''; row.querySelector('[data-role="hidden"]').value = panel.querySelector('[data-setting-hidden]')?.checked || panel.querySelector('[data-setting-hidden]')?.value === '1' ? '1' : ''; row.dataset.linkedHandover = panel.querySelector('[data-setting-linked-handover]')?.checked ? '1' : ''; const settingSubfields = panel.querySelector('[data-setting-subfields]'); if (settingSubfields) { const targetSubfields = row.querySelector('.designer-subfield-list'); targetSubfields.innerHTML = ''; readDesigner(settingSubfields).forEach((child) => targetSubfields.appendChild(fieldDesigner(child, true))); const columnsPerRow = panel.querySelector('[data-setting-columns-per-row]')?.value || ''; const targetColumns = row.querySelector('[data-role="columns-per-row"]'); if (targetColumns) targetColumns.value = columnsPerRow; } }); updateLayoutDesignerState((layout) => { const key = panel.dataset.fieldKey; const candidate = clampLayoutItem({ row: panel.querySelector('[data-layout-row]')?.value, col: panel.querySelector('[data-layout-col]')?.value, rowSpan: panel.querySelector('[data-layout-rowspan]')?.value, colSpan: panel.querySelector('[data-layout-colspan]')?.value, width: panel.querySelector('[data-layout-width]')?.value, height: panel.querySelector('[data-layout-height]')?.value }, layout); if (isLayoutAreaFree(layout, key, candidate)) layout.fields[key] = candidate; }); panel.hidden = true; }
  });
  document.querySelector('#ragicDesignerModal')?.addEventListener('input', (event) => {
    if (event.target?.matches('[data-role="width"], [data-layout-width]')) syncSubtableWidthFromEvent(event.target);
    if (event.target?.matches('[data-layout-width], [data-layout-colspan], [data-layout-col]')) refreshLayoutWidthHint(event.target.closest('#layoutFieldSettingsPanel'));
  });
  document.querySelector('#layoutDesignerPanel')?.addEventListener('click', async (event) => {
    if (!event.target.closest('.btn-save-layout')) return;
    if (!canUse('design')) return alert('您沒有設計權限');
    await saveDesignerSchema();
    alert('表單排版已儲存');
  });  
  document.querySelector('#saveSchemaButton')?.addEventListener('click', async () => {
    if (!canUse('design')) return alert('您沒有設計權限');
    await saveDesignerSchema({ close: true });
  });
  setupRagicFormActions();
  applyRagicPermissionUi(); setRagicViewMode('list'); window.addEventListener('resize', setRagicFormOverlayOffset); document.querySelector('#newRecordButton').addEventListener('click', () => { if (canUse('edit')) renderForm({}, { mode: 'edit' }); }); document.querySelector('#backToListButton').addEventListener('click', () => { setRagicViewMode('list'); RAGIC_STATE.formMode = 'view'; });
  document.querySelector('#ragicFormView')?.addEventListener('click', (event) => {
    const editButton = event.target.closest('#ragicEditRecord');
    const cancelEdit = event.target.closest('#ragicCancelEdit');
    const closeForm = event.target.closest('#ragicCloseForm');
    const prevRecord = event.target.closest('#ragicPrevRecord');
    const nextRecord = event.target.closest('#ragicNextRecord');
    if (editButton) { event.preventDefault(); const record = currentRecord(); if (record && canUse('edit')) renderForm(record, { mode: 'edit' }); }
    if (cancelEdit) { event.preventDefault(); const record = currentRecord(); if (record) renderForm(record, { mode: 'view' }); }
    if (closeForm) { event.preventDefault(); document.querySelector('#backToListButton')?.click(); }
    if (prevRecord) { event.preventDefault(); openRecordAtIndex(currentFilteredIndex() - 1); }
    if (nextRecord) { event.preventDefault(); openRecordAtIndex(currentFilteredIndex() + 1); }
    const viewImage = event.target.closest('.ragic-view-image, .ragic-view-field .field-value img, .form-view-mode .field-value img');
    if (viewImage && event.currentTarget.contains(viewImage)) {
      event.preventDefault();
      openImagePreview(viewImage.currentSrc || viewImage.src, viewImage.alt || '圖片');
    }
  });
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
      let savedId = RAGIC_STATE.currentId;
      if (savedId) {
        if (!existingRecord?.createdAt) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await collection.doc(savedId).set(data, { merge: true });
        renderForm({ ...existingRecord, ...data, id: savedId }, { mode: 'view' });
      } else {
        const docRef = collection.doc();
        savedId = docRef.id;
        await docRef.set({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() 
      }
      await syncLinkedHandoverFields({ data, logId: savedId });                   
      document.querySelector('#backToListButton').click();
    } catch (error) {
      console.error(error);
      alert(error.message || '儲存失敗，請稍後再試。');
    } finally {
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = originalText; }
    }
  });
  const legacyTableWrap = document.querySelector('#ragicHeaderRow')?.closest('.ragic-table-wrap');
  legacyTableWrap?.classList.add('ragic-table-wrapper');
  const ragicTableWrap = document.querySelector('.ragic-table-wrapper');
  window.addEventListener('resize', updateRagicStickyHeaderOffset);
  ragicTableWrap?.addEventListener('input', handleColumnMenuInput);
  ragicTableWrap?.addEventListener('change', handleColumnMenuChange);
  ragicTableWrap?.addEventListener('click', handleColumnMenuClick);
  ragicTableWrap?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const trigger = event.target.closest('.col-menu-trigger');
    if (!trigger || !ragicTableWrap.contains(trigger)) return;
    event.preventDefault();
    event.stopPropagation();
    toggleColumnMenu(trigger.dataset.field);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.ragic-table-wrapper')) closeAllMenus();
  });
  document.querySelector('#ragicTableBody').addEventListener('click', (event) => { const thumbnail = event.target.closest('.ragic-thumbnail'); if (thumbnail) { event.preventDefault(); event.stopPropagation(); openImagePreview(thumbnail.src, thumbnail.alt || '圖片'); return; } const link = event.target.closest('a'); if (link) { event.stopPropagation(); return; } const button = event.target.closest('[data-icon-action]'); if (button) { event.preventDefault(); event.stopPropagation(); const id = button.dataset.docId; if (button.dataset.iconAction === 'fire') window.toggleFire(id); if (button.dataset.iconAction === 'pin') window.togglePin(id); return; } });
  document.querySelector('#ragicTableBody').addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key)) return; const link = event.target.closest('a'); if (link) { event.stopPropagation(); return; } const button = event.target.closest('[data-icon-action]'); if (!button) return; event.preventDefault(); button.click(); });
  if (!collection || !schemaDoc) { RAGIC_STATE.schema = makeDefaultSchema(config); renderHeader(); return; }
  schemaDoc.onSnapshot(async (doc) => {
    if (!doc.exists) await schemaDoc.set(makeDefaultSchema(config), { merge: true });
    const loadedSchema = doc.exists ? applyFormLayoutOverrides(mergeLogConfigFields(doc.data(), config), config) : makeDefaultSchema(config);
    if (doc.exists && fixDuplicateKeys(loadedSchema.fields || [])) {
      await schemaDoc.set({ ...loadedSchema, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    RAGIC_STATE.schema = applyFormLayoutOverrides(normalizeSchema(loadedSchema), config);
    renderHeader();
    applyRagicPermissionUi();
    applyFilters();
  });
  collection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => { RAGIC_STATE.records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); applyRagicPermissionUi(); applyFilters(); });
};
