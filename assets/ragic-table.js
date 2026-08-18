
const LOG_FORM_LAYOUT = { columns: 6, rows: 4, columnGap: 12, rowGap: 10, fieldHeight: 64, textareaHeight: 178 };
const LOG_SUBTABLE_COLUMN_RATIOS = [2, 1, 2, 1, 2, 1];
const LOG_LIST_WIDTHS = { issue: 700, note: 260, image: 90, file: 90, serial: 110, date: 150 };
const DEFAULT_LIST_WIDTH = 1000;
const normalizeListWidth = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(20000, Math.max(320, parsed)) : DEFAULT_LIST_WIDTH;
};
const LOG_FIELD_LAYOUT_BY_LABEL = {
  '發生時間': { row: 1, col: 1 }, '接洽人員': { row: 1, col: 2 }, '客戶': { row: 1, col: 3 }, '分類': { row: 1, col: 4 }, '狀態': { row: 1, col: 5 }, '編號': { row: 1, col: 6 },
  '完成時間': { row: 2, col: 1 }, '完成人員': { row: 2, col: 2 }, '更新日期': { row: 2, col: 3 }, '圖片': { row: 2, col: 4 }, '檔案': { row: 2, col: 5 }, '提報連結': { row: 2, col: 6 },
  '問題描述': { row: 3, col: 1, colSpan: 3, rowSpan: 2, textarea: true }, '備註': { row: 3, col: 4, colSpan: 2, rowSpan: 2, textarea: true }
};

const isLogModule = (config = RAGIC_STATE?.config) => ['log', 'workLogs'].includes(String(config?.collection || config?.dataCollection || '')) || String(config?.title || '').includes('日誌');
const isLogNewModule = (config = RAGIC_STATE?.config) => ['log_new', 'workLogsNew'].includes(String(config?.collection || config?.dataCollection || '')) || String(config?.title || '').trim() === '日誌 NEW';
const isTrackingModule = (config = RAGIC_STATE?.config) => ['tracking', 'workTracking'].includes(String(config?.collection || config?.dataCollection || '')) || String(config?.title || '') === '對接追蹤';
const isReminderEnabledField = (field = {}) => field.type === 'reminderEnabled' || field.key === 'reminder_enabled' || String(field.label || '').trim() === '啟用提醒';
const reminderRecordValue = (record = {}, field = {}) => {
  if (isReminderEnabledField(field)) return true;
  if (field.type === 'reminderTime' || field.key === 'reminder_at' || String(field.label || '').trim() === '提醒時間') {
    return record[field.key] ?? record.reminder_at ?? record.reminderTime ?? '';
  }
  return record[field.key];
};
const logFieldLayoutFor = (field = {}) => LOG_FIELD_LAYOUT_BY_LABEL[field.label] || null;

const RAGIC_STATE = { records: [], filtered: [], currentId: null, formMode: 'view', editDirty: false, sortKey: '', sortDir: 'asc', filters: {}, openMenuKey: '', page: 1, pageSize: 50, config: null, schema: null, unsubscribeRecords: null, collection: null, schemaDoc: null };

const showRagicNotice = (message, { tone = 'success', duration = 2800 } = {}) => {
  let notice = document.querySelector('#ragicPageNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'ragicPageNotice';
    notice.className = 'ragic-page-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    document.body.appendChild(notice);
  }
  window.clearTimeout(notice._hideTimer);
  notice.className = `ragic-page-notice is-${tone} is-visible`;
  notice.textContent = String(message || '操作完成');
  notice._hideTimer = window.setTimeout(() => notice.classList.remove('is-visible'), duration);
};

const confirmRagicAction = ({ title = '確認操作', message = '', confirmText = '確定', danger = false } = {}) => new Promise((resolve) => {
  const modal = document.createElement('div');
  modal.className = 'ragic-confirm-backdrop';
  modal.innerHTML = `<section class="ragic-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="ragicConfirmTitle">
    <h2 id="ragicConfirmTitle">${escapeHtml(title)}</h2>
    <p>${escapeHtml(message)}</p>
    <div class="ragic-confirm-actions">
      <button class="secondary" type="button" data-confirm-cancel>取消</button>
      <button class="${danger ? 'btn-danger' : 'primary'}" type="button" data-confirm-accept>${escapeHtml(confirmText)}</button>
    </div>
  </section>`;
  const finish = (accepted) => {
    modal.remove();
    resolve(accepted);
  };
  modal.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
  modal.querySelector('[data-confirm-accept]').addEventListener('click', () => finish(true));
  modal.addEventListener('click', (event) => { if (event.target === modal) finish(false); });
  modal.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish(false); });
  document.body.appendChild(modal);
  modal.querySelector('[data-confirm-cancel]').focus();
});

window.showRagicNotice = showRagicNotice;
window.confirmRagicAction = confirmRagicAction;
window.getCurrentRagicRecordId = () => RAGIC_STATE.currentId || '';

const hasUnsavedRagicChanges = () => RAGIC_STATE.formMode === 'edit' && RAGIC_STATE.editDirty;
const confirmDiscardRagicChanges = () => !hasUnsavedRagicChanges() || window.confirm('目前有尚未儲存的內容，確定要放棄並離開嗎？');
const clearRagicDirtyState = () => { RAGIC_STATE.editDirty = false; };
if (!document.querySelector('#ragicColumnMenuRuntimeStyles')) {
  const style = document.createElement('style');
  style.id = 'ragicColumnMenuRuntimeStyles';
  style.textContent = '.ragic-table{table-layout:fixed!important}.ragic-table th,.ragic-table td{min-width:0!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important}.ragic-table th.col-menu-cell{overflow:visible!important}.col-menu-dropdown[hidden]{display:none!important}.col-menu-dropdown:not([hidden]){display:block!important;z-index:10000!important}' +
    '.ragic-field-pair-toggle{display:flex!important;align-items:center!important;gap:12px!important;min-height:48px!important;padding:0 14px!important;box-sizing:border-box!important}' +
    '.ragic-field-pair-toggle>span{order:2!important;margin:0!important;white-space:nowrap!important;font-weight:600!important}' +
    '.ragic-field-pair-toggle>input[type=checkbox]{order:1!important;width:20px!important;height:20px!important;min-width:20px!important;max-width:20px!important;min-height:20px!important;max-height:20px!important;margin:0!important;appearance:auto!important}' +
    '.ragic-view-field-pair-toggle{display:flex!important;align-items:center!important;gap:12px!important;padding:0 14px!important;box-sizing:border-box!important}' +
    '.ragic-view-field-pair-toggle .ragic-view-label{order:2!important;margin:0!important;white-space:nowrap!important}' +
    '.ragic-view-field-pair-toggle .ragic-view-value{order:1!important;width:20px!important;height:20px!important;border:1px solid #8b95a5!important;border-radius:2px!important;font-size:0!important;position:relative!important;flex:none!important}' +
    '.ragic-view-field-pair-toggle.is-checked .ragic-view-value:after{content:"✓";font-size:16px!important;line-height:18px!important;position:absolute!important;left:2px!important;top:0!important}';
  document.head.appendChild(style);
}

const SUBFIELD_TYPE_GROUPS = [
  {
    label: '📝 文字',
    types: [
      { value: 'text', label: '單行' },
      { value: 'textarea', label: '多行' }
    ]
  },
  {
    label: '🕐 時間',
    types: [
      { value: 'date', label: '日期' },
      { value: 'datetime', label: '日期時間' },
      { value: 'createdDate', label: '建立日期' },
      { value: 'updatedDate', label: '更新時間' }
    ]
  },
  {
    label: '📋 下拉',
    types: [
      { value: 'select', label: '單選' },
      { value: 'multiselect', label: '多選' }
    ]
  },
  {
    label: '🔗 連結',
    types: [
      { value: 'link', label: '連結' }
    ]
  },
  {
    label: '🖼️ 圖片',
    types: [
      { value: 'image', label: '圖片' }
    ]
  },
  {
    label: '📎 檔案',
    types: [
      { value: 'file', label: '檔案' }
    ]
  },
  {
    label: '🔢 編號',
    types: [
      { value: 'serial', label: '編號' }
    ]
  },
  {
    label: '📊 子表格',
    types: [
      { value: 'subtable', label: '子表格' }
    ]
  }
];

const SUBFIELD_TYPES =
  SUBFIELD_TYPE_GROUPS.flatMap((group) => group.types);

const FIELD_TYPE_GROUPS = [
  {
    label: '📝 文字',
    types: [
      { value: 'text', label: '單行文字' },
      { value: 'textarea', label: '多行文字' }
    ]
  },
  {
    label: '🕐 時間',
    types: [
      { value: 'date', label: '日期' },
      { value: 'datetime', label: '日期時間' },
      { value: 'createdDate', label: '建立日期時間' },
      { value: 'updatedDate', label: '更新日期時間' }
    ]
  },
  {
    label: '📋 下拉選單',
    types: [
      { value: 'select', label: '單選' },
      { value: 'multiselect', label: '多選' }
    ]
  },
  {
    label: '🔗 連結與附件',
    types: [
      { value: 'link', label: '連結' },
      { value: 'image', label: '圖片' },
      { value: 'file', label: '檔案' }
    ]
  },
  {
    label: '📊 其他',
    types: [
      { value: 'serial', label: '編號' },
      { value: 'subtable', label: '子表格' }
    ]
  }
];

const FIELD_TYPES =
  FIELD_TYPE_GROUPS.flatMap((group) => group.types);

const FIELD_PAIR_TYPES = [
  {
    value: 'reminderPair',
    label: '啟用提醒／提醒時間'
  },
  {
    value: 'reportPair',
    label: '提報／提報連結'
  }
];

const LEGACY_FIELD_TYPES = [
  { value: 'createdDate', label: '建立日期' },
  { value: 'updatedDate', label: '更新時間' },
  { value: 'checkbox', label: '核取方塊' },
  { value: 'boolean', label: '布林值' },
  { value: 'reminderEnabled', label: '啟用提醒' },
  { value: 'reminderTime', label: '提醒時間' },
  { value: 'reportEnabled', label: '提報' },
  { value: 'reportLink', label: '提報連結' }
];

const COLLECTION_MAP = { workHandover: 'handover', workLogs: 'log', workReports: 'report', workTracking: 'tracking', workAlerts: 'alert', meetingRecords: 'meeting', knowledgeBase: 'knowledge', aiDatabase: 'ai_database' };
const SCHEMA_MAP = { handover: 'handover_schema', log: 'log_schema', report: 'report_schema', tracking: 'tracking_schema', alert: 'alert_schema', meeting: 'meeting_schema', knowledge: 'knowledge_schema', ai_database: 'ai_database_schema' };

const normalizeKey = (text, fallback = 'field') => String(text || fallback).trim().replace(/[^\w\u4e00-\u9fa5]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || `${fallback}_${Date.now()}`;
const isImageDataUrl = (value) => typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim());
const imageDataSources = (value) => {
  if (isImageDataUrl(value)) return [value.trim()];
  if (isImageDataUrl(value?.data)) return [value.data.trim()];
  if (Array.isArray(value)) return value.flatMap((item) => imageDataSources(item));
  return [];
};
const valueToText = (value) => {
  if (isImageDataUrl(value) || isImageDataUrl(value?.data)) return value?.name ? `圖片：${value.name}` : '圖片';
  if (Array.isArray(value)) return value.map((item) => String(valueToText(item))).filter(Boolean).join('、');
  if (value?.toDate) return formatLocalDateTime(value.toDate());
  if (value?.name && value?.data) return `${value.name} (${formatFileSize(value.size)})`;
  if (value && typeof value === 'object') return Object.values(value).map((item) => String(valueToText(item))).filter(Boolean).join(' / ');
  return value ?? '';
};
const formatLocalDateTime = (date = new Date()) => date.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const currentDateTimeInputValue = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
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
const displayDateTime = (value) => {
  if (!value) return '';
  if (typeof value?.toDate === 'function') return formatLocalDateTime(value.toDate());
  if (Number.isFinite(value?.seconds)) return formatLocalDateTime(new Date(value.seconds * 1000));
  return String(value).replace('T', ' ').replace(/-/g, '/');
};
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
  const columns = normalizeFormLayoutNumber(source.columns, { min: 3, max: 10, fallback: 5 });
  const rows = normalizeFormLayoutNumber(source.rows, { min: 2, max: 10, fallback: 4 });
  const explicitSourceFields = source.fields && typeof source.fields === 'object' ? source.fields : {};
  // 舊版表單把座標存在欄位本身；設計器第一次開啟時自動轉成 formLayout.fields。
  const sourceFields = Object.keys(explicitSourceFields).length ? explicitSourceFields : Object.fromEntries((fields || [])
    .filter((field) => field?.key && field.formRow && field.formCol)
    .map((field) => [field.key, {
      row: field.formRow,
      col: field.formCol,
      colSpan: field.formColSpan || 1,
      rowSpan: field.formRowSpan || 1,
      width: field.formWidth || null,
      height: field.formHeight || null
    }]));
  const fieldKeys = new Set(
  (fields || []).map((field) => field.key).filter(Boolean)
);

const fieldsByKey = new Map(
  (fields || []).map((field) => [field.key, field])
);

const nextFields = {};
  
  Object.entries(sourceFields).forEach(([key, layout]) => {
    if (fieldKeys.size && !fieldKeys.has(key)) return;
    const fixed = null;
    const row = normalizeFormLayoutNumber(fixed?.row ?? layout?.row, { min: 1, max: rows });
    const col = normalizeFormLayoutNumber(fixed?.col ?? layout?.col, { min: 1, max: columns });
    if (!row || !col) return;
    const currentField = fieldsByKey.get(key);
const isSubtable = currentField?.type === 'subtable';
const isTrackingTextarea =
  isTrackingModule() &&
  currentField?.type === 'textarea';
const isTrackingSubtable =
  isTrackingModule() &&
  isSubtable;
const isTrackingImage =
  isTrackingModule() &&
  currentField?.type === 'image';

nextFields[key] = {
  row,

  // 子表格可和一般欄位一樣調整起始欄與跨欄數；未設定時才預設滿版。
  col,

  colSpan: normalizeFormLayoutNumber(
    fixed?.colSpan ?? layout?.colSpan,
    {
      min: 1,
      max: columns - col + 1,
      fallback: isSubtable ? columns - col + 1 : 1
    }
  ),

  rowSpan: normalizeFormLayoutNumber(
    fixed?.rowSpan ?? layout?.rowSpan,
    {
      min: 1,
      max: rows - row + 1,
      fallback: 1
    }
  ),

  // 子表格不能再套用固定 px 寬度
  width: isSubtable
    ? null
    : (
        fixed
          ? null
          : normalizeFormLayoutNumber(
              layout?.width ?? layout?.formWidth,
              {
                min: 40,
                max: 2000,
                fallback: null
              }
            )
      ),

  height: isTrackingTextarea || isTrackingSubtable || isTrackingImage
    ? null
    : fixed
    ? (
        fixed.textarea
          ? LOG_FORM_LAYOUT.textareaHeight
          : LOG_FORM_LAYOUT.fieldHeight
      )
    : normalizeFormLayoutNumber(
        layout?.height ?? layout?.formHeight,
        {
          min: 32,
          max: 2000,
          fallback: null
        }
      )
};
  });

  if (isTrackingModule()) {
    // 舊版子表格若跨列壓到其他欄位，只清除衝突的跨列；
    // 使用者之後仍可在空白列中重新調整高度。
    (fields || [])
      .filter((field) => field.type === 'subtable')
      .forEach((field) => {
        const item = nextFields[field.key];
        if (!item || item.rowSpan <= 1) return;
        const overlapsOtherField = Object.entries(nextFields).some(
          ([key, other]) =>
            key !== field.key &&
            item.row < other.row + other.rowSpan &&
            item.row + item.rowSpan > other.row &&
            item.col < other.col + other.colSpan &&
            item.col + item.colSpan > other.col
        );
        if (overlapsOtherField) item.rowSpan = 1;
      });
  }

  if (isTrackingModule()) {
    const subtableField = (fields || []).find((field) => field.type === 'subtable');
    const imageField = (fields || []).find((field) => field.type === 'image' || field.label === '圖片');
    const subtableLayout = subtableField ? nextFields[subtableField.key] : null;
    const imageLayout = imageField ? nextFields[imageField.key] : null;
    const isLegacyBlockedLayout =
      subtableLayout &&
      imageLayout &&
      subtableLayout.row >= 4 &&
      imageLayout.row === subtableLayout.row - 1;

    if (isLegacyBlockedLayout) {
      const occupied = Object.entries(nextFields)
        .filter(([key]) => key !== imageField.key && key !== subtableField.key)
        .map(([, item]) => item);
      let imageTarget = null;

      for (let row = 2; row >= 1 && !imageTarget; row -= 1) {
        for (let col = 1; col <= columns && !imageTarget; col += 1) {
          const candidate = { row, col, colSpan: 1, rowSpan: 1 };
          const overlaps = occupied.some((item) =>
            candidate.row < item.row + item.rowSpan &&
            candidate.row + candidate.rowSpan > item.row &&
            candidate.col < item.col + item.colSpan &&
            candidate.col + candidate.colSpan > item.col
          );
          if (!overlaps) imageTarget = candidate;
        }
      }

      if (imageTarget) {
        nextFields[imageField.key] = {
          ...imageLayout,
          ...imageTarget
        };
        nextFields[subtableField.key] = {
          ...subtableLayout,
          row: 3,
          col: 1,
          colSpan: columns
        };
      }
    }
  }

  return { columns, rows, fields: nextFields, version: String(source.version || '') };
};
const compactEmptyLayoutRows = (layout = {}, enabled = false) => {
  if (!enabled) return layout;
  const entries = Object.entries(layout.fields || {}).filter(([, item]) => Number(item?.row) > 0);
  const occupiedRows = new Set();
  entries.forEach(([, item]) => {
    const start = Math.max(1, Number(item.row) || 1);
    const span = Math.max(1, Number(item.rowSpan) || 1);
    for (let row = start; row < start + span; row += 1) occupiedRows.add(row);
  });
  const orderedRows = [...occupiedRows].sort((a, b) => a - b);
  const rowMap = new Map(orderedRows.map((row, index) => [row, index + 1]));
  if (!orderedRows.length || orderedRows.every((row, index) => row === index + 1)) return layout;
  const fields = Object.fromEntries(Object.entries(layout.fields || {}).map(([key, item]) => {
    if (!Number(item?.row)) return [key, item];
    const start = Number(item.row);
    const span = Math.max(1, Number(item.rowSpan) || 1);
    const end = start + span - 1;
    const mappedStart = rowMap.get(start) || start;
    const mappedEnd = rowMap.get(end) || mappedStart;
    return [key, { ...item, row: mappedStart, rowSpan: Math.max(1, mappedEnd - mappedStart + 1) }];
  }));
  return { ...layout, rows: orderedRows.length, fields };
};

const resolvedFormLayout = (config = RAGIC_STATE.config) => compactEmptyLayoutRows(
  normalizeDesignerFormLayout(RAGIC_STATE.schema?.formLayout || config?.formLayout, getFields()),
  Boolean(config?.compactEmptyRows)
);

const applyFormGridLayout = (grid, config = RAGIC_STATE.config) => {
  if (!grid) return grid;

  const layout = resolvedFormLayout(config);

  const columns = layout.columns || 5;
  const configuredRows = layout.rows || 4;
  const rowGap = 10;
  const fields = getFields().filter((field) => field.type !== 'subtable');
  const placedFields = fields
    .map((field) => {
      const item = layout.fields?.[field.key];
      return { field, item };
    })
    .filter(({ item }) => item?.row);
  const usedRows = placedFields.reduce((maximum, { item }) => {
    const span = Math.max(1, Number(item.rowSpan) || 1);
    return Math.max(maximum, Number(item.row) + span - 1);
  }, 0);
  const rows = Math.max(1, Math.min(configuredRows, usedRows || configuredRows));
  const rowHeights = Array(rows).fill(48);

  placedFields.forEach(({ field, item }) => {
    const start = Math.max(0, Number(item.row) - 1);
    const span = Math.max(1, Math.min(Number(item.rowSpan) || 1, rows - start));
    if (start >= rows || span < 1) return;
    const desiredHeight =
      field.type === 'textarea' ? (isTrackingModule() ? 48 : 178) :
      ['image', 'file'].includes(field.type) ? 175 :
      Math.max(60, Number(config?.formRowHeight) || 60);
    const trackHeight = Math.max(48, Math.ceil((desiredHeight - (rowGap * (span - 1))) / span));
    for (let offset = 0; offset < span; offset += 1) {
      rowHeights[start + offset] = Math.max(rowHeights[start + offset], trackHeight);
    }
  });

  grid.style.display = 'grid';
  grid.style.gridTemplateColumns =
    `repeat(${columns}, minmax(0, 1fr))`;
  grid.style.gridTemplateRows = rowHeights
    .map((height) => isTrackingModule() ? `minmax(${height}px, auto)` : `${height}px`)
    .join(' ');
  grid.style.gridAutoRows = '48px';
  grid.style.columnGap = '12px';
  grid.style.rowGap = `${rowGap}px`;
  grid.style.alignItems = 'stretch';
  grid.style.alignContent = 'start';

  return grid;
};

const applyFormLayout = (element, field = {}) => {
  if (!element) return element;
  const activeLayout = resolvedFormLayout(RAGIC_STATE.config);
  const layoutItem = activeLayout.fields?.[field.key] || {};
  const row = normalizeFormLayoutNumber(layoutItem.row ?? field.formRow);
  const columns = activeLayout.columns || 5;
  const col = normalizeFormLayoutNumber(layoutItem.col ?? field.formCol, { max: columns });
  const hasExplicitSubtableSpan = layoutItem.colSpan !== undefined || field.formColSpan !== undefined;
  const colSpan = normalizeFormLayoutNumber(layoutItem.colSpan ?? field.formColSpan, { max: columns, fallback: field.type === 'subtable' && !hasExplicitSubtableSpan ? columns : 1 });
  const configuredRowSpan = normalizeFormLayoutNumber(layoutItem.rowSpan ?? field.formRowSpan, { max: activeLayout.rows || 10, fallback: 1 });
  const rowSpan = configuredRowSpan;
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
  } else if (field.type === 'image') {
    const imageHeight = Math.max(layoutHeight, 168);
    element.style.height = `${imageHeight}px`;
    element.style.minHeight = `${imageHeight}px`;
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

const DENSE_FORM_LAYOUT = {
  '日期': { order: 10, span: 2 },
  '班別': { order: 10, span: 2 },
  '部門': { order: 10, span: 2 },
  '分類': { order: 10, span: 2 },
  '狀態': { order: 10, span: 2 },
  '提報者': { order: 10, span: 2 },
  '提報人員': { order: 10, span: 2 },
  '級數': { order: 20, span: 2 },
  '客戶': { order: 20, span: 6 },
  '客戶域名': { order: 20, span: 6 },
  '編號': { order: 20, span: 2 },
  '完成者': { order: 30, span: 2 },
  '完成時間': { order: 30, span: 2 },
  '更新時間': { order: 30, span: 2 },
  '提醒時間': { order: 40, span: 2 },
  '啟用提醒': { order: 40, span: 2 },
  '日誌連結': { order: 40, span: 8 },
  '提醒連結': { order: 40, span: 8 },
  '圖片': { order: 50, span: 6, role: 'media' },
  '檔案': { order: 50, span: 6, role: 'media' },
  '問題描述': { order: 60, span: 7, role: 'narrative' },
  '備註': { order: 60, span: 5, role: 'narrative' }
};
const applyDenseFormLayout = (element, field = {}) => {
  if (!element) return element;
  const label = String(field.label || field.key || '').trim();
  const layout = DENSE_FORM_LAYOUT[label] || { order: 25, span: 3 };
  element.classList.add('dense-form-field');
  if (layout.role) element.classList.add(`dense-form-field-${layout.role}`);
  element.dataset.fieldLabel = label;
  element.style.setProperty('--dense-order', String(layout.order));
  element.style.setProperty('--dense-span', String(layout.span));
  return element;
};
// 日誌 NEW 的檢視與編輯必須忠實使用設計表格儲存的 formLayout。
const usesDenseFormLayout = () =>
  !document.body.classList.contains('handover-page') &&
  !isLogNewModule();
const applyDenseSubtableLayout = (section) => {
  if (!section) return section;
  section.classList.add('dense-form-subtable');
  section.style.setProperty('--dense-order', '100');
  section.style.setProperty('--dense-span', '12');
  return section;
};
const groupDenseFieldPairs = (grid) => {
  if (!grid) return grid;
  [
    { className: 'dense-field-pair-media', order: 50, labels: ['圖片', '檔案'] },
    { className: 'dense-field-pair-narrative', order: 60, labels: ['問題描述', '備註'] }
  ].forEach(({ className, order, labels }) => {
    const fields = labels.map((label) => [...grid.children].find((child) => child.dataset?.fieldLabel === label));
    if (fields.some((field) => !field)) return;
    const pair = document.createElement('div');
    pair.className = `dense-field-pair ${className}`;
    pair.style.setProperty('--dense-order', String(order));
    fields.forEach((field) => pair.appendChild(field));
    grid.appendChild(pair);
  });
  return grid;
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
  const keyText = String(field.key || '').trim();
  const labelText = label.trim();
  const canonicalPairType =
    keyText === 'reminderEnabled' || keyText === 'reminder_enabled' || labelText === '啟用提醒' ? 'reminderEnabled' :
    keyText === 'reminderTime' || keyText === 'reminder_at' || labelText === '提醒時間' ? 'reminderTime' :
    keyText === 'reportEnabled' || keyText === 'report_enabled' || labelText === '提報' ? 'reportEnabled' :
    keyText === 'reportLink' || keyText === 'report_link' || labelText === '提報連結' ? 'reportLink' : '';
  const type = canonicalPairType || field.type || 'text';
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
const normalizeSchema = (schema = {}) => {
  const fields = schema.fields || [];
  const listVisibility = schema.listVisibility && typeof schema.listVisibility === 'object'
    ? schema.listVisibility
    : Object.fromEntries(fields.filter((field) => field?.key).map((field) => [field.key, field.listVisible !== false]));

  return {
    fields: normalizeFields(fields, 'field'),
    formLayout: normalizeDesignerFormLayout(
      schema.formLayout,
      fields
    ),
    listWidth: normalizeListWidth(schema.listWidth),
    listWidthFull: schema.listWidthFull === true,
    listVisibility,
    listOrder: Array.isArray(schema.listOrder)
      ? schema.listOrder.map((key) => String(key || '').trim()).filter(Boolean)
      : []
  };
};
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
const virtualListSubfield = (parent, subfield) => ({
  ...subfield,
  key: `${parent.key}::${subfield.key}`,
  label: subfield.label,
  listParentKey: parent.key,
  listSubfieldKey: subfield.key
});
const listFields = () => {
  const allFields = getFields();
  const defaultFields = allFields.filter((field) => field.type !== 'subtable');
  const savedOrder = RAGIC_STATE.schema?.listOrder;
  const configuredColumns = Array.isArray(savedOrder) && savedOrder.length
    ? savedOrder
    : RAGIC_STATE.config?.listColumns;
  const visible = (field) => RAGIC_STATE.schema?.listVisibility?.[field.key] !== false;
  if (!Array.isArray(configuredColumns) || !configuredColumns.length) return defaultFields.filter(visible);
  return configuredColumns
    .map((column) => {
      const target = String(column || '').trim();
      const directField = allFields.find((field) => field.key === column || String(field.label || '').trim() === target);
      if (directField && directField.type !== 'subtable') return directField;
      const parent = allFields.find((field) =>
        field.type === 'subtable' &&
        (field.fields || []).some((subfield) => String(subfield.label || '').trim() === target)
      );
      const subfield = parent?.fields?.find((item) => String(item.label || '').trim() === target);
      return parent && subfield ? virtualListSubfield(parent, subfield) : directField;
    })
    .filter(Boolean)
    .filter(visible);
};
const listColumns = () => listFields().map((field) => field.key);
const fieldByKey = (key) => getFields().find((field) => field.key === key) || listFields().find((field) => field.key === key);
const recordListFieldValue = (record = {}, field = {}) => {
  if (!field.listParentKey || !field.listSubfieldKey) return record[field.key];
  const rows = Array.isArray(record[field.listParentKey]) ? record[field.listParentKey] : [];
  return rows
    .map((row) => row?.[field.listSubfieldKey])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => String(valueToText(value)))
    .join('\n');
};
const optionList = (field) => Array.isArray(field.options) ? field.options : String(field.options || '').split('\n').map((item) => item.trim()).filter(Boolean);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const fieldSelector = (fieldKey) => `[data-field="${window.CSS?.escape ? CSS.escape(fieldKey) : String(fieldKey).replace(/\"/g, '\\"')}"]`;

const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_TOTAL_BYTES = 800 * 1024;
const IMAGE_TOTAL_LIMIT_MESSAGE = '舊版內嵌圖片總大小超過限制，請刪除部分舊圖片後再上傳';
if (!window._multiSelectClickBound) {
  document.addEventListener('click', () => document.querySelectorAll('.multi-select-dropdown.show').forEach((dropdown) => dropdown.classList.remove('show')));
  window._multiSelectClickBound = true;
}
if (!window._ragicSelectBackspaceBound) {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Backspace' && event.code !== 'Backspace' && event.keyCode !== 8) return;
    const eventSelect = event.target?.tagName === 'SELECT' ? event.target : null;
    const activeSelect = document.activeElement?.tagName === 'SELECT' ? document.activeElement : null;
    const select = eventSelect || activeSelect;
    if (!select || select.multiple) return;
    if (!select.closest('#ragicForm, .ragic-table, .ragic-subtable, #ragicDesignerModal')) return;
    event.preventDefault();
    event.stopPropagation();
    if (![...select.options].some((option) => option.value === '')) select.insertAdjacentHTML('afterbegin', '<option value="">請選擇</option>');
    select.value = '';
    select.selectedIndex = [...select.options].findIndex((option) => option.value === '');
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, true);
  window._ragicSelectBackspaceBound = true;
}
const SERIAL_PREFIX_MAP = { handover: 'HO-', log: 'LOG-', meeting: 'MTG-', report: 'RPT-', tracking: 'TRK-', alert: 'ALT-', knowledge: 'KB-', ai_database: 'AI-' };
const readonlyFieldTypes = new Set(['createdDate', 'updatedDate', 'serial']);
const manualSystemDateField = (field = {}) =>
  isTrackingModule() &&
  RAGIC_STATE.config?.manualSystemDates === true &&
  ['createdDate', 'updatedDate'].includes(field.type);
const inlineReadonlyFieldTypes = new Set([...readonlyFieldTypes, 'image', 'file', 'subtable']);
const DEFAULT_LIST_COLUMN_WIDTH = 180;
const DEFAULT_FIELD_WIDTHS = {
  text: 180,
  textarea: 320,
  number: 120,
  date: 120,
  time: 100,
  datetime: 170,
  select: 150,
  multiselect: 180,
  checkbox: 100,
  boolean: 100,
  image: 100,
  file: 180,
  serial: 120,
  createdDate: 170,
  updatedDate: 170,
  link: 220,
  subtable: 320
};
const MIN_FORM_FIELD_WIDTH = 56;
const MIN_FORM_FIELD_HEIGHT = 38;
const DEFAULT_FORM_FIELD_HEIGHT = 48;
const DEFAULT_SUBTABLE_FIELD_HEIGHT = 180;
const normalizeFormFieldSize = (value, min = 1) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? Math.max(min, Math.round(parsed)) : null; };
const normalizeFieldWidth = (width) => { const value = Number(width); return Number.isFinite(value) && value > 0 ? Math.round(value) : null; };
const fieldColumnWidth = (field = {}) => {
  return field.manualWidth === true ? normalizeFieldWidth(field.width) : null;
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
const syncRagicTableWidth = (table) => {
  if (!table) return;
  const total = [...table.querySelectorAll('colgroup col')].reduce((sum, col) => {
    const width = Number.parseFloat(col.style.width || getComputedStyle(col).width);
    return sum + (Number.isFinite(width) ? width : 0);
  }, 0);
  if (total > 0) table.style.setProperty('--ragic-table-width', `${Math.round(total)}px`);
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
  syncRagicTableWidth(table);
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
    resizer.title = '按住滑鼠左鍵，左右拖曳調整欄寬';
    resizer.setAttribute('aria-label', `調整${fieldByKey(th.dataset.fieldKey)?.label || '此欄位'}的列表欄寬`);
    th.appendChild(resizer);

    resizer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = th.getBoundingClientRect().width;
      let latestWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth));
      const previousTableLayout = table.style.tableLayout;

      table.style.tableLayout = 'fixed';
      resizer.classList.add('is-dragging');
      document.body.classList.add('is-col-resizing');
      resizer.setPointerCapture?.(event.pointerId);

      const onPointerMove = (moveEvent) => {
        latestWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)));
        setColumnWidth(table, th, latestWidth);
      };

      const finishResize = async (upEvent) => {
        resizer.removeEventListener('pointermove', onPointerMove);
        resizer.removeEventListener('pointerup', finishResize);
        resizer.removeEventListener('pointercancel', finishResize);
        resizer.releasePointerCapture?.(upEvent.pointerId);
        resizer.classList.remove('is-dragging');
        document.body.classList.remove('is-col-resizing');
        table.style.tableLayout = previousTableLayout;

        const field = getFields().find((item) => item.key === th.dataset.fieldKey);
        if (field) {
          field.width = latestWidth;
          field.manualWidth = true;
          await saveSchema();
        }
      };

      resizer.addEventListener('pointermove', onPointerMove);
      resizer.addEventListener('pointerup', finishResize);
      resizer.addEventListener('pointercancel', finishResize);
    });
  });
};

const applyRagicColumnGroup = (table, fields = listFields()) => {
  if (!table) return;
  table.querySelector('colgroup')?.remove();
  const colgroup = document.createElement('colgroup');
  // 整張列表固定自動滿版；個別欄寬仍由欄位屬性設定控制。
  const totalWidth = Math.max(DEFAULT_LIST_WIDTH, table.parentElement?.clientWidth || 0);
  const markerWidth = Math.min(50, totalWidth);
  const columnClasses = fields.map((field) => ragicColumnClass(field));
  const compactAutoWidth = (field, columnClass) => {
    if (columnClass === 'col-date') return 175;
    if (columnClass === 'col-shift') return 80;
    if (columnClass === 'col-dept') return 110;
    if (columnClass === 'col-category') return 105;
    if (columnClass === 'col-status') return 95;
    if (columnClass === 'col-boolean') return 80;
    if (columnClass === 'col-person') return 100;
    if (columnClass === 'col-number') return 90;
    if (columnClass === 'col-option') return 125;
    if (columnClass === 'col-media') return 90;
    if (columnClass === 'col-link') return 160;
    if (columnClass === 'col-content') return 360;
    return Math.min(160, DEFAULT_FIELD_WIDTHS[field.type] || 130);
  };
  const widths = fields.map((field, index) =>
    fieldColumnWidth(field) || compactAutoWidth(field, columnClasses[index])
  );
  const manualTotal = fields.reduce((sum, field, index) =>
    sum + (field.manualWidth ? widths[index] : 0), 0
  );
  const automaticIndexes = fields
    .map((field, index) => field.manualWidth ? -1 : index)
    .filter((index) => index >= 0);
  const automaticBaseTotal = automaticIndexes.reduce((sum, index) => sum + widths[index], 0);
  const extraSpace = Math.max(0, totalWidth - markerWidth - manualTotal - automaticBaseTotal);
  const contentIndexes = automaticIndexes.filter((index) => columnClasses[index] === 'col-content');
  const flexibleIndexes = contentIndexes.length ? contentIndexes : automaticIndexes;
  const extraPerFlexibleColumn = flexibleIndexes.length ? extraSpace / flexibleIndexes.length : 0;
  const flexibleSet = new Set(flexibleIndexes);
  const markerCol = document.createElement('col');
  markerCol.style.setProperty('min-width', `${markerWidth}px`, 'important');
  markerCol.style.setProperty('width', `${markerWidth}px`);
  colgroup.appendChild(markerCol);
  let resolvedColumnsWidth = 0;
  fields.forEach((field, index) => {
    const col = document.createElement('col');
    const columnClass = columnClasses[index];
    const minimumWidth = field.manualWidth
      ? MIN_COLUMN_WIDTH
      : columnClass === 'col-date'
        ? 150
        : columnClass === 'col-content'
          ? 220
          : 72;
    const width = field.manualWidth
      ? Math.max(MIN_COLUMN_WIDTH, widths[index])
      : Math.max(minimumWidth, widths[index] + (flexibleSet.has(index) ? extraPerFlexibleColumn : 0));
    col.style.setProperty('min-width', `${minimumWidth}px`, 'important');
    col.style.setProperty('width', `${Math.round(width)}px`);
    resolvedColumnsWidth += Math.round(width);
    colgroup.appendChild(col);
  });
  // Keep saved pixel widths exact. A fixed 100% table compresses every
  // column when their requested widths exceed the viewport; growing the table
  // to the resolved total lets the existing wrapper scroll horizontally.
  const resolvedTableWidth = Math.max(totalWidth, markerWidth + resolvedColumnsWidth);
  table.style.setProperty('width', `${Math.round(resolvedTableWidth)}px`, 'important');
  table.style.setProperty('min-width', '100%', 'important');
  table.style.setProperty('max-width', 'none', 'important');
  table.style.setProperty('--ragic-table-width', `${Math.round(resolvedTableWidth)}px`);
  table.insertBefore(colgroup, table.firstChild);
};

const currentRagicUser = () => sessionStorage.getItem('account') || sessionStorage.getItem('omniplayStaffAccount') || sessionStorage.getItem('omniplayStaffCode') || '';
const currentRagicUserName = () => sessionStorage.getItem('omniplayStaffName') || sessionStorage.getItem('omniplayStaffCode') || sessionStorage.getItem('omniplayStaffAccount') || '';
const monthlyShiftCache = new Map();
const normalizeRosterShift = (value) => ['晚', '晚班', 'night', 'pm'].includes(String(value || '').trim().toLowerCase()) ? '晚班' : (value ? '早班' : '');
const previousMonthKey = (month) => {
  const [year, monthNumber] = String(month).split('-').map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const signedInRosterShift = async (dateValue) => {
  const staffId = sessionStorage.getItem('omniplayStaffId') || '';
  const month = String(dateValue || today()).slice(0, 7);
  if (!staffId || !/^\d{4}-\d{2}$/.test(month) || !window.omniplayDb) return '';
  const cacheKey = `${staffId}_${month}`;
  if (monthlyShiftCache.has(cacheKey)) return monthlyShiftCache.get(cacheKey);
  const previousMonth = previousMonthKey(month);
  const leave = window.omniplayDb.collection('leave');
  const staff = window.omniplayDb.collection('staff');
  try {
    const [currentDoc, monthDoc, previousDoc, previousMonthDoc, staffDoc] = await Promise.all([
      leave.doc(`${staffId}_${month}`).get(),
      leave.doc(month).get(),
      leave.doc(`${staffId}_${previousMonth}`).get(),
      leave.doc(previousMonth).get(),
      staff.doc(staffId).get()
    ]);
    const raw = currentDoc.data()?.shift || monthDoc.data()?.shifts?.[staffId] || previousDoc.data()?.shift || previousMonthDoc.data()?.shifts?.[staffId] || staffDoc.data()?.shift || '';
    const shift = normalizeRosterShift(raw);
    if (shift) monthlyShiftCache.set(cacheKey, shift);
    return shift;
  } catch (error) {
    console.warn('讀取登入人員班表失敗：', error);
    return '';
  }
};
const applySignedInRosterShift = async ({ force = false } = {}) => {
  if (RAGIC_STATE.currentId || RAGIC_STATE.formMode !== 'edit') return;
  const shiftField = getFields().find((field) => String(field.label || '').trim() === '班別');
  if (!shiftField) return;
  const shiftControl = document.querySelector(`#ragicForm [name="${CSS.escape(shiftField.key)}"]`);
  const dateControl = document.querySelector('#ragicForm [name="date"]');
  if (!shiftControl || (!force && shiftControl.value)) return;
  const requestedDate = dateControl?.value || today();
  const shift = await signedInRosterShift(requestedDate);
  if (!RAGIC_STATE.currentId && (!dateControl || dateControl.value === requestedDate) && shift) shiftControl.value = shift;
};

const normalizeColumnText = (value = '') => String(value || '').replace(/\s+/g, '').toLowerCase();
const ragicColumnClass = (field = {}) => {
  const text = normalizeColumnText(`${field.key || ''}${field.label || ''}`);
  const type = String(field.type || '').trim().toLowerCase();
  if (/(date|日期|時間)/.test(text)) return 'col-date';
  if (/(shift|班別)/.test(text)) return 'col-shift';
  if (/(dept|department|部門)/.test(text)) return 'col-dept';
  if (/(category|分類)/.test(text)) return 'col-category';
  if (/(status|狀態)/.test(text)) return 'col-status';
  if (type === 'checkbox' || type === 'boolean' || /(啟用|是否|提報$)/.test(text)) return 'col-boolean';
  if (/(contact|owner|publisher|finisher|creator|reporter|staff|接洽者|完成者|完成人員|負責人|處理人員|發佈者|建立者|提報者|人員)/.test(text)) return 'col-person';
  if (type === 'number' || type === 'serial' || /(serial|編號|分數|級數)/.test(text)) return 'col-number';
  if (type === 'select' || type === 'multiselect') return 'col-option';
  if (type === 'image' || type === 'file' || /(圖片|檔案|附件)/.test(text)) return 'col-media';
  if (type === 'link' || /(link|連結)/.test(text)) return 'col-link';
  if (type === 'textarea' || /(content|handover|事項|交接事項|內容|description|說明|問題|備註|紀錄|結果|回覆)/.test(text)) return 'col-content';
  return 'col-auto';
};
const cellTooltipText = (record, field) => {
  const value = recordListFieldValue(record, field);
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
  if (!isLogModule(config) && !config.enforceConfigFields) return schema;
  const savedLayout = schema.formLayout && typeof schema.formLayout === 'object' ? schema.formLayout : null;
  const hasSavedPositions = Boolean(savedLayout?.fields && Object.keys(savedLayout.fields).length);
  const configuredVersion = String(config.formLayout?.version || '');
  const savedVersion = String(savedLayout?.version || '');
  const useConfiguredPreset = Boolean(configuredVersion && configuredVersion !== savedVersion);
  const forceConfiguredLayout = config.forceConfigFormLayout === true;
  const configuredFields = defaultConfigFields(config);
  const savedFields = Array.isArray(schema.fields) ? schema.fields : [];
  const configuredByKey = new Map(configuredFields.map((field) => [String(field?.key || ''), field]));
  const savedKeys = new Set(savedFields.map((field) => String(field?.key || '')));
  const mergedFields = savedFields.length
    ? [
        ...savedFields.map((field) => ({
          ...(configuredByKey.get(String(field?.key || '')) || {}),
          ...field
        })),
        ...configuredFields.filter((field) => !savedKeys.has(String(field?.key || '')))
      ]
    : configuredFields;
  return {
    ...schema,
    // 已儲存的欄位設計（包含 width/manualWidth/listVisible/order）為主要來源；
    // config 僅補上尚未存在的新欄位，不能覆蓋使用者剛儲存的列表設定。
    fields: mergedFields,
    formLayout: forceConfiguredLayout || useConfiguredPreset
      ? config.formLayout
      : (hasSavedPositions ? savedLayout : config.formLayout)
  };
};


const makeDefaultSchema = (config) => applyFormLayoutOverrides(normalizeSchema({
  fields: [...(config.fields || []), ...(config.subtable ? [{ ...config.subtable, type: 'subtable', fields: config.subtable.fields || [] }] : [])]
}), config);

const createMultiSelectControl = (field, value = '', subfield = false) => {
  const selected = Array.isArray(value) ? value.map(String) : String(value || '').split(/[、,]/).map((item) => item.trim()).filter(Boolean);
  // 容忍歷史值：只補進目前這筆控制項，不修改 schema 的正式選項清單。
  const baseOptions = [...optionList(field)];
  selected.forEach((item) => {
    if (item && !baseOptions.includes(item)) baseOptions.push(item);
  });
  const wrapper = document.createElement('div');
  wrapper.className = 'multi-select ragic-multi-select';
  const select = document.createElement('select');
  select.multiple = true;
  select.hidden = true;
  select.name = subfield ? '' : field.key;
  if (subfield) select.dataset.subfield = field.key;
  baseOptions.forEach((option) => {
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
  baseOptions.forEach((option) => {
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
  if (field.type === 'reminderEnabled' || field.type === 'reportEnabled') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = subfield ? '' : field.key;

    if (subfield) input.dataset.subfield = field.key;

    input.checked =
      value === true ||
      value === 'true' ||
      value === '1';

    return input;
  }

  if (field.type === 'reminderTime') {
    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.name = subfield ? '' : field.key;

    if (subfield) input.dataset.subfield = field.key;

    input.required = Boolean(field.required);
    input.value = normalizeDateValue(value);

    return input;
  }

  if (field.type === 'reportLink') {
    const input = document.createElement('input');
    input.type = 'url';
    input.name = subfield ? '' : field.key;

    if (subfield) input.dataset.subfield = field.key;

    input.required = Boolean(field.required);
    input.value = value || '';

    return input;
  }

  if (field.type === 'multiselect') {
    return createMultiSelectControl(field, value, subfield);
  }

  if (field.type === 'checkbox' || field.type === 'boolean') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = subfield ? '' : field.key;

    if (subfield) input.dataset.subfield = field.key;

    input.checked =
      value === true ||
      value === 'true' ||
      value === '1' ||
      ((value === '' || value == null) &&
        field.defaultValue === true);

    return input;
  }

  let input;

  if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = isTrackingModule() ? 1 : (field.rows || 4);
  } else if (field.type === 'select') {
    input = document.createElement('select');

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '請選擇';
    input.appendChild(emptyOption);

    const selectOptions = [...optionList(field)];
    const loginName = currentRagicUserName();

    if (
      field.defaultCurrentUser &&
      loginName &&
      !selectOptions.includes(loginName)
    ) {
      selectOptions.unshift(loginName);
    }

    // 容忍歷史值：舊資料不在目前選項時，仍顯示並保留原值。
    const currentValue = value == null ? '' : String(value);
    if (currentValue && !selectOptions.includes(currentValue)) {
      selectOptions.push(currentValue);
    }

    selectOptions.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;

      if (/^-{3,}$/.test(option)) {
        opt.disabled = true;
        opt.textContent = '──────────';
      }

      input.appendChild(opt);
    });
  } else if (manualSystemDateField(field) && !subfield) {
    input = document.createElement('input');
    input.type = 'datetime-local';
  } else if (readonlyFieldTypes.has(field.type)) {
    input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
  } else {
    input = document.createElement('input');

    input.type =
      field.type === 'datetime'
        ? 'datetime-local'
        : field.type === 'link'
          ? 'url'
          : field.type === 'image' || field.type === 'file'
            ? 'file'
            : field.type || 'text';

    if (field.type === 'image') {
      input.accept = 'image/*';
      input.multiple = true;
    }
  }

  input.name = subfield ? '' : field.key;

  input.required =
    field.type === 'image' ||
    field.type === 'file' ||
    readonlyFieldTypes.has(field.type)
      ? false
      : Boolean(field.required);

  input.placeholder = field.placeholder || '';

  if (subfield) {
    input.dataset.subfield = field.key;
  }

  if (field.type !== 'image' && field.type !== 'file') {
    const controlValue =
      field.type === 'date' || field.type === 'datetime' || manualSystemDateField(field)
        ? normalizeDateValue(value)
        : value;

    const loginDefault =
      field.defaultCurrentUser &&
      !subfield &&
      !RAGIC_STATE.currentId
        ? currentRagicUserName()
        : '';

    input.value =
      controlValue ||
      loginDefault ||
      field.defaultValue ||
      (
        field.type === 'datetime' &&
        field.defaultNow &&
        !subfield
          ? currentDateTimeInputValue()
          : manualSystemDateField(field) && !subfield
            ? currentDateTimeInputValue()
            : field.type === 'updatedDate' && !subfield
              ? formatLocalDateTime()
              : field.type === 'date' && !subfield
              ? today()
              : ''
      );
  }

  return input;
};

const inlineValue = (value, field) => {
  if (field?.type === 'date' || field?.type === 'datetime' || field?.type === 'link') return String(value || '');
  if (field?.type === 'multiselect') return Array.isArray(value) ? value : String(value || '').split(/[、,]/).map((item) => item.trim()).filter(Boolean);
  return String(value ?? '');
};
const autoGrowTextarea = (textarea) => {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(42, textarea.scrollHeight)}px`;
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
  if (!record || !field || field.listParentKey || inlineReadonlyFieldTypes.has(field.type)) return;
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
  const wrap = document.createElement('label');
  const isPairToggle = ['reminderEnabled', 'reportEnabled'].includes(field.type);
  wrap.className = `ragic-field ragic-field-${field.type || 'text'}${isPairToggle ? ' ragic-field-pair-toggle' : ''}`;
  if (isTrackingModule() && field.type === 'text' && String(field.label || '').trim() === '單行文字') {
    wrap.classList.add('is-tracking-placeholder-field');
  }
  wrap.innerHTML = `<span>${field.label}${field.required ? ' *' : ''}</span>`;
  applyFormLayout(wrap, field);
  if (usesDenseFormLayout()) applyDenseFormLayout(wrap, field);
  const control = createControl(field, value);
  if (isReminderEnabledField(field)) {
    control.checked = true;
    control.disabled = true;
    control.setAttribute('aria-readonly', 'true');
    control.title = '提醒固定啟用';
  }
  wrap.appendChild(field.type === 'image' || field.type === 'file' ? createFileUploadArea(field, control, value) : control);
  return wrap;
};

const mergeTrackingWalletIntoGroupEditor = (form) => {
  if (!isTrackingModule() || !form) return;
  const groupSection = [...form.querySelectorAll('.ragic-subtable')].find((section) => {
    const parent = getFields().find((field) => field.key === section.dataset.subtable);
    return parent?.type === 'subtable' && (
      String(parent.label || '').includes('群組名稱') ||
      (parent.fields || []).some((subfield) => String(subfield.label || '').trim() === '群組名稱')
    );
  });
  const walletField = [...form.querySelectorAll('.ragic-field')].find(
    (field) => String(field.querySelector(':scope > span')?.textContent || '').trim() === '錢包類型'
  );
  const rowFields = groupSection?.querySelector('.subtable-row-fields');
  if (!groupSection || !walletField || !rowFields) return;
  groupSection.classList.add('has-inline-wallet-field');
  walletField.classList.add('tracking-inline-wallet-field');
  rowFields.appendChild(walletField);

  // The regular form layout may mark a top-level field as full-width. Force the
  // moved wallet control to participate in the group's three-column row.
  rowFields.style.setProperty('display', 'grid', 'important');
  rowFields.style.setProperty('grid-template-columns', '68px minmax(180px, 1fr) minmax(120px, .55fr)', 'important');
  rowFields.style.setProperty('align-items', 'end', 'important');
  walletField.style.setProperty('grid-column', '3', 'important');
  walletField.style.setProperty('grid-row', '1', 'important');
  walletField.style.setProperty('width', 'auto', 'important');
  [...rowFields.children].slice(0, 2).forEach((field, index) => {
    field.style.setProperty('grid-column', String(index + 1), 'important');
    field.style.setProperty('grid-row', '1', 'important');
  });
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

let RAGIC_IMAGE_UPLOAD_COUNT = 0;
const setRagicImageUploadBusy = (delta) => {
  RAGIC_IMAGE_UPLOAD_COUNT = Math.max(0, RAGIC_IMAGE_UPLOAD_COUNT + delta);
  document.querySelectorAll('button[form="ragicForm"][type="submit"], #ragicForm button[type="submit"]').forEach((button) => {
    if (RAGIC_IMAGE_UPLOAD_COUNT > 0) {
      if (!button.dataset.imageUploadOriginalText) button.dataset.imageUploadOriginalText = button.textContent || '儲存';
      button.disabled = true;
      button.textContent = '圖片處理中…';
    } else if (button.dataset.imageUploadOriginalText) {
      button.disabled = false;
      button.textContent = button.dataset.imageUploadOriginalText;
      delete button.dataset.imageUploadOriginalText;
    }
  });
};
const showPendingImagePreview = (file, container, label = '圖片') => {
  if (!file || !container) return () => {};
  let list = container.querySelector('.image-preview-list');
  if (!list) {
    list = document.createElement('div');
    list.className = 'image-preview-list';
    container.appendChild(list);
  }
  const objectUrl = URL.createObjectURL(file);
  const preview = document.createElement('div');
  preview.className = 'image-preview-item image-upload-preview is-uploading';
  preview.innerHTML = `<img src="${escapeHtml(objectUrl)}" alt="${escapeHtml(label)}上傳預覽"><span>圖片處理中…</span>`;
  list.appendChild(preview);
  setRagicImageUploadBusy(1);
  return () => {
    URL.revokeObjectURL(objectUrl);
    preview.remove();
    if (!list.children.length) list.remove();
    setRagicImageUploadBusy(-1);
  };
};
window.showRagicPendingImage = showPendingImagePreview;

const estimateBase64Bytes = (value = '') => {
  const base64 = String(value).split(',').pop() || '';
  return Math.ceil(base64.length * 3 / 4);
};

const imageTotalBytes = (images = []) => normalizeImageArray(images)
  .filter((image) => String(image).startsWith('data:'))
  .reduce((total, image) => total + estimateBase64Bytes(image), 0);

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

const compressImageForFirestore = async (file) => {
  const loadedImage = await loadImage(await readFileAsDataUrl(file));
  const scale = loadedImage.naturalWidth > 1200 ? 1200 / loadedImage.naturalWidth : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(loadedImage.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(loadedImage.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('圖片轉換失敗')), 'image/jpeg', 0.72));
  if (blob.size > 760 * 1024) {
    const fallbackScale = Math.min(1, 800 / loadedImage.naturalWidth);
    canvas.width = Math.max(1, Math.round(loadedImage.naturalWidth * fallbackScale));
    canvas.height = Math.max(1, Math.round(loadedImage.naturalHeight * fallbackScale));
    const fallbackContext = canvas.getContext('2d');
    fallbackContext.fillStyle = '#fff';
    fallbackContext.fillRect(0, 0, canvas.width, canvas.height);
    fallbackContext.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
    const fallbackBlob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('圖片轉換失敗')), 'image/jpeg', 0.58));
    return readFileAsDataUrl(new File([fallbackBlob], file.name || 'image.jpg', { type: 'image/jpeg' }));
  }
  return readFileAsDataUrl(new File([blob], file.name || 'image.jpg', { type: 'image/jpeg' }));
};
const uploadImageOriginal = async (file) => {
  if (!file) return '';
  if (!file.type?.startsWith('image/')) throw new Error('請選擇圖片檔案');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('單張圖片不可超過 50MB');
  return compressImageForFirestore(file);
};
window.uploadRagicImageFile = uploadImageOriginal;

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
  for (const file of [...(files || [])]) {
    const clearPending = showPendingImagePreview(file, container);
    try {
      newImages.push(await uploadImageOriginal(file));
    } finally {
      clearPending();
    }
  }
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
    else if (isReminderEnabledField(field)) data[field.key] = true;
    else if (['checkbox', 'boolean', 'reminderEnabled', 'reportEnabled'].includes(field.type)) data[field.key] = input.checked;
    else data[field.key] = input.value.trim();
  }
  assertImageTotalWithinLimit(allImages);
  return data;
};

const validateLogCompletionRules = () => {
  if (!isLogModule()) return true;
  const control = (key) => document.querySelector(`#ragicForm [name="${key}"]`);
  const value = (key) => String(control(key)?.value || '').trim();
  const completedBy = value('completed_by');
  const completedAt = value('completed_at');
  const errors = [];
  let firstInvalid = null;
  const requireControl = (key, message, valid = Boolean(value(key))) => {
    if (valid) return;
    errors.push(message);
    firstInvalid ||= control(key);
  };
  if (completedBy && !completedAt) requireControl('completed_at', '已填寫完成者，完成時間為必填');
  if (completedAt && !completedBy) requireControl('completed_by', '已填寫完成時間，完成者為必填');
  if (!completedBy && !completedAt) {
    requireControl('reminder_at', '尚未完成時，提醒時間為必填');
    requireControl('processing_department', '尚未完成時，處理部門為必填');
    requireControl('note', '尚未完成時，備註必須填入詢問部門的日期時間');
  }
  if (!errors.length) return true;
  alert(`請完成以下欄位：\n• ${errors.join('\n• ')}`);
  firstInvalid?.focus();
  firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
};

const showLogNewRequiredModal = (items, firstInvalid) => {
  document.querySelector('#logNewRequiredModal')?.remove();
  if (!document.querySelector('#logNewRequiredModalStyles')) {
    const style = document.createElement('style');
    style.id = 'logNewRequiredModalStyles';
    style.textContent = `
      #logNewRequiredModal { z-index: 10020; }
      #logNewRequiredModal .log-new-required-card {
        width: min(520px, calc(100vw - 28px));
        max-height: min(720px, calc(100vh - 40px));
        overflow: hidden;
        border-radius: 20px;
        background: var(--panel, #fff);
        color: var(--text, #0f172a);
        box-shadow: 0 24px 70px rgba(15, 23, 42, .28);
      }
      #logNewRequiredModal .log-new-required-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 22px 24px 14px;
        border-bottom: 1px solid var(--line, #e2e8f0);
      }
      #logNewRequiredModal h2 { margin: 0 0 6px; font-size: 21px; line-height: 1.3; }
      #logNewRequiredModal p { margin: 0; color: var(--muted, #64748b); font-size: 14px; }
      #logNewRequiredModal .log-new-required-close {
        width: 36px; height: 36px; flex: 0 0 36px; border: 1px solid var(--line, #dbe3ef);
        border-radius: 10px; background: transparent; color: inherit; font-size: 20px; cursor: pointer;
      }
      #logNewRequiredModal .log-new-required-body { padding: 18px 24px; overflow: auto; max-height: 52vh; }
      #logNewRequiredModal ul { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
      #logNewRequiredModal li {
        display: flex; align-items: flex-start; gap: 10px; padding: 11px 13px;
        border: 1px solid #fecaca; border-radius: 12px; background: #fff7f7; color: #991b1b;
        font-weight: 650; line-height: 1.45;
      }
      #logNewRequiredModal li::before { content: '!'; display: grid; place-items: center; width: 20px; height: 20px; flex: 0 0 20px; border-radius: 50%; background: #ef4444; color: #fff; font-size: 12px; }
      #logNewRequiredModal .log-new-required-actions { display: flex; justify-content: flex-end; padding: 14px 24px 22px; }
      #logNewRequiredModal .log-new-required-confirm { min-width: 108px; }
      @media (max-width: 600px) {
        #logNewRequiredModal { padding: 14px; align-items: center; }
        #logNewRequiredModal .log-new-required-header { padding: 18px 18px 12px; }
        #logNewRequiredModal .log-new-required-body { padding: 14px 18px; max-height: 55vh; }
        #logNewRequiredModal .log-new-required-actions { padding: 12px 18px 18px; }
        #logNewRequiredModal .log-new-required-confirm { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  const modal = document.createElement('div');
  modal.id = 'logNewRequiredModal';
  modal.className = 'ragic-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'logNewRequiredTitle');
  modal.innerHTML = `
    <div class="log-new-required-card">
      <div class="log-new-required-header">
        <div><h2 id="logNewRequiredTitle">必填欄位尚未完成</h2><p>請先完成下列 ${items.length} 個欄位，再儲存日誌。</p></div>
        <button class="log-new-required-close" type="button" aria-label="關閉">×</button>
      </div>
      <div class="log-new-required-body"><ul></ul></div>
      <div class="log-new-required-actions"><button class="primary log-new-required-confirm" type="button">知道了</button></div>
    </div>`;
  const list = modal.querySelector('ul');
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
  document.body.appendChild(modal);

  const close = () => {
    modal.remove();
    firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => firstInvalid?.focus({ preventScroll: true }), 260);
  };
  modal.querySelector('.log-new-required-close').addEventListener('click', close);
  modal.querySelector('.log-new-required-confirm').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  modal.querySelector('.log-new-required-confirm').focus();
};

const validateLogNewRequiredFields = () => {
  if (!isLogNewModule()) return true;
  const form = document.querySelector('#ragicForm');
  const fields = getFields();
  const missing = [];
  let firstInvalid = null;
  const addMissing = (label, target) => {
    if (!label || missing.includes(label)) return;
    missing.push(label);
    firstInvalid ||= target;
  };
  const hasValue = (field, target) => {
    if (!target) return false;
    if (['checkbox', 'boolean', 'reminderEnabled', 'reportEnabled'].includes(field.type)) return Boolean(target.checked);
    if (field.type === 'multiselect') return Boolean(target.selectedOptions?.length);
    if (field.type === 'image') return getImageInputValues(target).length > 0;
    if (field.type === 'file') return Boolean(target.files?.length || getFileInputValue(target));
    return Boolean(String(target.value || '').trim());
  };

  fields.forEach((field) => {
    if (field.type === 'subtable') {
      const requiredSubfields = (field.fields || []).filter((subfield) => subfield.required);
      if (!requiredSubfields.length) return;
      const rows = [...form.querySelectorAll(`[data-subtable="${CSS.escape(field.key)}"] .subtable-row`)];
      rows.forEach((row, rowIndex) => requiredSubfields.forEach((subfield) => {
        const target = row.querySelector(`[data-subfield="${CSS.escape(subfield.key)}"]`);
        if (!hasValue(subfield, target)) addMissing(`${field.label}：第 ${rowIndex + 1} 列「${subfield.label}」`, target);
      }));
      return;
    }
    if (!field.required) return;
    const target = form.querySelector(`[name="${CSS.escape(field.key)}"]`);
    if (!hasValue(field, target)) addMissing(field.label || field.key, target);
  });

  const control = (key) => form.querySelector(`[name="${CSS.escape(key)}"]`);
  const value = (key) => String(control(key)?.value || '').trim();
  const completedBy = value('completed_by');
  const completedAt = value('completed_at');
  const status = value('status');
  if (status === '已完成') {
    if (!completedBy) addMissing('完成者（狀態為已完成）', control('completed_by'));
    if (!completedAt) addMissing('完成時間（狀態為已完成）', control('completed_at'));
  } else if (completedBy && !completedAt) {
    addMissing('完成時間（已填寫完成者）', control('completed_at'));
  } else if (completedAt && !completedBy) {
    addMissing('完成者（已填寫完成時間）', control('completed_by'));
  } else if (!completedBy && !completedAt) {
    if (!value('reminder_at')) addMissing('提醒時間（尚未完成）', control('reminder_at'));
    if (!value('processing_department')) addMissing('處理部門（尚未完成）', control('processing_department'));
    if (!value('note')) addMissing('備註（請填入詢問部門的日期時間）', control('note'));
  }

  if (!missing.length) return true;
  showLogNewRequiredModal(missing, firstInvalid);
  return false;
};

const validateCompletedStatusRules = () => {
  const fields = getFields();
  const statusField = fields.find((field) => field.key === 'status' || /狀態/.test(String(field.label || '')));
  const statusControl = statusField ? document.querySelector(`#ragicForm [name="${CSS.escape(statusField.key)}"]`) : null;
  if (String(statusControl?.value || '').trim() !== '已完成') return true;
  const personField = fields.find((field) => ['completed_by', 'finisher', 'completed_person'].includes(field.key) || /^(完成者|完成人員)$/.test(String(field.label || '').trim()));
  const timeField = fields.find((field) => ['completed_at', 'completion_time'].includes(field.key) || String(field.label || '').trim() === '完成時間');
  const personControl = personField ? document.querySelector(`#ragicForm [name="${CSS.escape(personField.key)}"]`) : null;
  const timeControl = timeField ? document.querySelector(`#ragicForm [name="${CSS.escape(timeField.key)}"]`) : null;
  const errors = [];
  if (!personField) errors.push('此表單尚未設定完成人員欄位');
  else if (!String(personControl?.value || '').trim()) errors.push('狀態為已完成時，完成人員為必填');
  if (!timeField) errors.push('此表單尚未設定完成時間欄位');
  else if (!String(timeControl?.value || '').trim()) errors.push('狀態為已完成時，完成時間為必填');
  if (!errors.length) return true;
  alert(`請完成以下欄位：\n• ${errors.join('\n• ')}`);
  const firstInvalid = !String(personControl?.value || '').trim() ? personControl : timeControl;
  firstInvalid?.focus();
  firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
};

const linkedLogUrl = (record = {}) => {
  const sourceId = String(record.sourceLogId || '').trim();
  if (sourceId) return new URL(`../work/log.html?id=${encodeURIComponent(sourceId)}`, window.location.href).href;
  const raw = String(record.sourceLogUrl || record.field_1783793471256_rn925 || '').trim();
  return raw.includes('work/log.html') ? raw : '';
};
const askLinkedLogRedirect = () => new Promise((resolve) => {
  document.querySelector('#linkedLogCompleteModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', '<div class="ragic-modal" id="linkedLogCompleteModal"><div class="ragic-modal-card" style="max-width:460px"><div class="ragic-form-toolbar"><h2>提報已完成</h2></div><div style="padding:24px"><p>此提報由日誌連動建立，是否前往原日誌？</p><div class="ragic-actions" style="display:flex;justify-content:flex-end;gap:12px"><button class="btn-secondary" data-linked-log-answer="no" type="button">否</button><button class="btn-primary" data-linked-log-answer="yes" type="button">是，前往日誌</button></div></div></div></div>');
  const modal = document.querySelector('#linkedLogCompleteModal');
  modal.addEventListener('click', (event) => {
    const answer = event.target.closest('[data-linked-log-answer]')?.dataset.linkedLogAnswer;
    if (!answer && event.target !== modal) return;
    modal.remove();
    resolve(answer === 'yes');
  });
});

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
  imageArea.addEventListener('click', (event) => {
    if (!input || event.target === input || event.target.closest('.image-preview-item, .image-remove-btn, a, button')) return;
    input.click();
  });
  imageArea.addEventListener('keydown', (event) => {
    if (!input || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    input.click();
  });
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
  item.style.setProperty('--form-row', 'auto');
  item.style.setProperty('--form-col', 'auto');
  item.style.setProperty('--form-rowspan', '1');
  item.innerHTML = `<div class="ragic-view-label">${escapeHtml(field.label || field.key)}</div><div class="ragic-view-value field-value">${titleOnlyDisplayValue(field, record)}</div>`;
  appendFormResizeHandles(item, field);
  return item;
};

const currentFilteredIndex = () => RAGIC_STATE.filtered.findIndex((item) => item.id === RAGIC_STATE.currentId);
const currentRecord = () => RAGIC_STATE.records.find((item) => item.id === RAGIC_STATE.currentId) || RAGIC_STATE.filtered.find((item) => item.id === RAGIC_STATE.currentId) || null;
const renderDisplayValue = (field, value) => {
  const embeddedImages = imageDataSources(value);
  if (embeddedImages.length) {
    return `<div class="ragic-view-images">${embeddedImages.map((src, index) => `<img class="ragic-view-image" src="${escapeHtml(src)}" alt="${escapeHtml(field?.label || '圖片')} ${index + 1}" title="點擊放大檢視">`).join('')}</div>`;
  }
  if (field?.type === 'image') {
    const images = normalizeImageArray(value);
    if (!images.length) return '<span class="ragic-view-empty">—</span>';
    return `<div class="ragic-view-images">${images.map((src, index) => `<img class="ragic-view-image" src="${escapeHtml(src)}" alt="${escapeHtml(field.label || '圖片')} ${index + 1}" title="點擊放大檢視">`).join('')}</div>`;
  }
  if (field?.type === 'file') return renderFileCell(value, field.label || '檔案') || '<span class="ragic-view-empty">—</span>';
  if (['checkbox', 'boolean', 'reminderEnabled', 'reportEnabled'].includes(field?.type)) return value === true || value === 'true' || value === '1' ? '是' : '否';
  if (field?.type === 'link') return value ? `<a class="ragic-link" href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>` : '<span class="ragic-view-empty">—</span>';
  if (field?.type === 'date') return escapeHtml(displayDate(value)) || '<span class="ragic-view-empty">—</span>';
  if (['datetime', 'createdDate', 'updatedDate'].includes(field?.type)) return escapeHtml(displayDateTime(value)) || '<span class="ragic-view-empty">—</span>';
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
  grid.className = `ragic-form-grid ragic-view-grid compact-view-grid${usesDenseFormLayout() ? ' dense-ragic-grid' : ''}`;
  applyFormGridLayout(grid);
  getFields().filter((field) => {
    if (field.type === 'subtable') return false;
    return !fixedLogLayout || Boolean(logFieldLayoutFor(field));
  }).forEach((field) => {
    const item = document.createElement('div');
    const isPairToggle = ['reminderEnabled', 'reportEnabled'].includes(field.type);
    const fieldValue = reminderRecordValue(record, field);
    const isChecked = fieldValue === true || fieldValue === 'true' || fieldValue === '1';
    item.className = `ragic-view-field ragic-view-field-${field.type || 'text'}${isPairToggle ? ' ragic-view-field-pair-toggle' : ''}${isPairToggle && isChecked ? ' is-checked' : ''}`;
    if (isTrackingModule() && field.type === 'text' && String(field.label || '').trim() === '單行文字') {
      item.classList.add('is-tracking-placeholder-field');
    }
    applyFormLayout(item, field);
    if (usesDenseFormLayout()) applyDenseFormLayout(item, field);
    if (usesDenseFormLayout()) {
      item.style.setProperty('--form-row', 'auto');
      item.style.setProperty('--form-col', 'auto');
      item.style.setProperty('--form-rowspan', '1');
    }
    const hasValue = Array.isArray(fieldValue)
      ? fieldValue.some((entry) => entry && Object.values(entry).some(Boolean))
      : ![undefined, null, ''].includes(fieldValue);
    item.classList.toggle('is-empty-view-field', !hasValue);
    item.innerHTML = `<div class="ragic-view-label">${escapeHtml(field.label || field.key)}</div><div class="ragic-view-value field-value">${isReminderEnabledField(field) ? '已啟用' : (isPairToggle ? '' : renderDisplayValue(field, fieldValue))}</div>`;
    appendFormResizeHandles(item, field);
    grid.appendChild(item);
  });
  if (!fixedLogLayout) titleOnlyLayoutFields().forEach((field) => grid.appendChild(createTitleOnlyField(field, record)));
  if (usesDenseFormLayout()) groupDenseFieldPairs(grid);
  form.appendChild(grid);
  
  getFields().filter((field) => field.type === 'subtable').forEach((field) => {
    const section = document.createElement('section');
    section.className = 'ragic-subtable ragic-view-subtable-section';
    if (
      isTrackingModule() &&
      field.type === 'subtable' &&
      (
        String(field.label || '').includes('群組名稱') ||
        (field.fields || []).some((subfield) => String(subfield.label || '').trim() === '群組名稱')
      )
    ) {
      section.classList.add('is-tracking-group-subtable');
    } else if (isTrackingModule() && field.type === 'subtable') {
      section.classList.add('is-tracking-detail-subtable');
    }
    if (!fixedLogLayout) applyFormLayout(section, field);
    if (usesDenseFormLayout()) {
      applyDenseSubtableLayout(section);
      section.style.setProperty('--form-row', 'auto');
      section.style.setProperty('--form-col', 'auto');
      section.style.setProperty('--form-rowspan', '1');
    }
    if (usesDenseFormLayout() && window.matchMedia('(min-width: 769px)').matches) {
      const viewportHeight = Math.max(220, Math.min(360, window.innerHeight - 600));
      section.style.setProperty('height', 'auto', 'important');
      section.style.setProperty('min-height', '0px', 'important');
      section.style.setProperty('max-height', `${viewportHeight}px`, 'important');
      section.style.setProperty('overflow-x', 'auto', 'important');
      section.style.setProperty('overflow-y', 'auto', 'important');
    }
    section.dataset.subtable = field.key;
    section.innerHTML = `<div class="ragic-subtable-head"><h3 class="ragic-subtable-title">${escapeHtml(field.label)}</h3></div>${renderSubtableView(field, record[field.key])}`;
    appendFormResizeHandles(section, field);
    (fixedLogLayout ? form : grid).appendChild(section);
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
  // 刪除鈕第一次開啟表單後會被搬進工具列；重建工具列前必須先保留節點，
  // 否則 innerHTML 會把它一併移除，造成取消後再開另一筆時刪除鈕消失。
  const deleteButton = document.querySelector('#deleteButton');
  legacyToolbar.classList.add('form-toolbar');
  const modeLabel = RAGIC_STATE.formMode === 'edit' ? '編輯' : '檢視';
  legacyToolbar.innerHTML = `<div class="form-toolbar-left"><button class="pager-btn" id="ragicPrevRecord" type="button">&lt; 上一筆</button><button class="pager-btn" id="ragicNextRecord" type="button">下一筆 &gt;</button></div><div class="form-toolbar-center ragic-form-title">${escapeHtml(modeLabel)}：${escapeHtml(formDisplayName())}</div><div class="form-toolbar-right"></div>`;
  const actions = legacyToolbar.querySelector('.form-toolbar-right');
  if (RAGIC_STATE.currentId && RAGIC_STATE.formMode !== 'edit' && canUse('edit')) {
    actions.insertAdjacentHTML('beforeend', '<button class="edit-btn" id="ragicEditRecord" type="button">✏️編輯</button>');
  }
  if (!RAGIC_STATE.currentId || RAGIC_STATE.formMode === 'edit') {
    actions.insertAdjacentHTML('beforeend', '<button class="btn-secondary" id="ragicCancelEdit" type="button">取消</button>');
    actions.insertAdjacentHTML('beforeend', '<button class="save-btn" form="ragicForm" type="submit">儲存</button>');
    } else if (RAGIC_STATE.currentId) {
    actions.insertAdjacentHTML('beforeend', '<button class="btn-secondary" id="ragicCloseForm" type="button">取消</button>');
  }
  if (deleteButton) {
    deleteButton.className = 'btn-delete';
    deleteButton.type = 'button';
    deleteButton.textContent = '刪除';
    deleteButton.hidden = !canUse('delete') || !RAGIC_STATE.currentId;
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
  const configuredWidths = (field.fields || []).map(subtableViewColumnWidth);
  const usesResponsiveLogCardLayout = isLogModule() && field.key === 'items';
  if (!usesResponsiveLogCardLayout && configuredWidths.length && configuredWidths.every(Boolean)) {
    fieldsGrid.style.setProperty(
      'grid-template-columns',
      configuredWidths.map((width) => `${width}px`).join(' '),
      'important'
    );
  }
  const isTrackingGroupField = isTrackingModule() && (
    String(field.label || '').includes('群組名稱') ||
    (field.fields || []).some((subfield) => String(subfield.label || '').trim() === '群組名稱')
  );
  if (isTrackingModule() && !isTrackingGroupField && (field.fields || []).length === 6) {
    fieldsGrid.style.setProperty(
      'grid-template-columns',
      'minmax(280px, 2.2fr) minmax(104px, .75fr) repeat(3, minmax(140px, 1fr)) minmax(280px, 2.2fr)',
      'important'
    );
  }
  if (isLogModule() && (field.fields || []).length === 6) fieldsGrid.classList.add('log-subtable-six-column');

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


const subtableRowHasUserValue = (row) => {
  if (!row) return false;
  if (row.querySelector('.image-upload-preview img, .image-preview img, [data-existing-file]')) return true;
  return [...row.querySelectorAll('input, select, textarea')].some((control) => {
    if (control.disabled) return false;
    if (control.type === 'checkbox' || control.type === 'radio') return control.checked;
    if (control.type === 'file') return Boolean(control.files?.length);
    if (control.tagName === 'SELECT' && control.multiple) {
      return [...control.selectedOptions].some((option) => String(option.value || '').trim());
    }
    return String(control.value || control.dataset?.imageValue || '').trim().length > 0;
  });
};

const ensureInitialLogNewSubtableRow = (section, field) => {
  const body = section?.querySelector('tbody');
  if (!body || body.querySelector(':scope > .subtable-row')) return;
  const row = renderSubtableRow(field);
  body.appendChild(row);
  row.querySelectorAll('.image-upload-area').forEach(attachImageUploadArea);
};

const enableAutoAppendSubtableRows = (section, field) => {
  const body = section?.querySelector('tbody');
  if (!body || body.dataset.autoAppendRows === 'true') return;
  body.dataset.autoAppendRows = 'true';

  const appendBlankRow = () => {
    const row = renderSubtableRow(field);
    row.classList.add('subtable-auto-blank-row');
    body.appendChild(row);
    row.querySelectorAll('.image-upload-area').forEach(attachImageUploadArea);
  };
  const ensureTrailingBlankRow = () => {
    const rows = [...body.querySelectorAll(':scope > .subtable-row')];
    if (!rows.length || subtableRowHasUserValue(rows[rows.length - 1])) appendBlankRow();
  };

  ensureTrailingBlankRow();
  const handleEntry = (event) => {
    const row = event.target?.closest?.('.subtable-row');
    if (!row || row !== body.querySelector(':scope > .subtable-row:last-child')) return;
    row.classList.remove('subtable-auto-blank-row');
    if (subtableRowHasUserValue(row)) ensureTrailingBlankRow();
  };
  body.addEventListener('input', handleEntry);
  body.addEventListener('change', handleEntry);
  body.addEventListener('click', (event) => {
    if (event.target?.closest?.('.subtable-row-delete')) queueMicrotask(ensureTrailingBlankRow);
  });
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
  clearRagicDirtyState();
  if (!form.dataset.dirtyTrackingBound) {
    form.dataset.dirtyTrackingBound = 'true';
    const markDirty = () => {
      if (RAGIC_STATE.formMode === 'edit') RAGIC_STATE.editDirty = true;
    };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
  }
  form.innerHTML = '';
  if (mode === 'view' && record.id) {
    renderViewForm(form, record);
  } else {
    const grid = document.createElement('div'); grid.className = `ragic-form-grid${usesDenseFormLayout() ? ' dense-ragic-grid' : ''}`; applyFormGridLayout(grid);
    getFields().filter((field) => field.type !== 'subtable').forEach((field) => grid.appendChild(createField(field, record[field.key])));
    titleOnlyLayoutFields().forEach((field) => grid.appendChild(createTitleOnlyField(field, record)));
    if (usesDenseFormLayout()) groupDenseFieldPairs(grid);
    form.appendChild(grid);
    getFields().filter((field) => field.type === 'subtable').forEach((field) => {
     const section = document.createElement('section');
      section.className = 'ragic-subtable';
      if (
      isTrackingModule() &&
      field.type === 'subtable' &&
      (
        String(field.label || '').includes('群組名稱') ||
        (field.fields || []).some((subfield) => String(subfield.label || '').trim() === '群組名稱')
      )
    ) {
      section.classList.add('is-tracking-group-subtable');
    } else if (isTrackingModule() && field.type === 'subtable') {
      section.classList.add('is-tracking-detail-subtable');
    }
      if (!fixedLogLayout) applyFormLayout(section, field);
      if (usesDenseFormLayout()) applyDenseSubtableLayout(section);
      section.dataset.subtable = field.key;
      section.innerHTML = `<div class="ragic-subtable-head"><h3 class="ragic-subtable-title">${escapeHtml(field.label)}</h3></div><div class="ragic-table-wrap"><table><tbody></tbody></table></div>`;
      const body = section.querySelector('tbody');
      (record[field.key]?.length ? record[field.key] : []).forEach((item) => body.appendChild(renderSubtableRow(field, item)));
      if (document.body.classList.contains('log-new-page')) {
        ensureInitialLogNewSubtableRow(section, field);
      } else {
        enableAutoAppendSubtableRows(section, field);
      }
      (fixedLogLayout ? form : grid).appendChild(section);
    });
    mergeTrackingWalletIntoGroupEditor(form);
    form.querySelectorAll('.image-upload-area').forEach(attachImageUploadArea);
    if (isTrackingModule()) {
      form.querySelectorAll('.form-field[data-type="textarea"] textarea').forEach((textarea) => {
        autoGrowTextarea(textarea);
        textarea.addEventListener('input', () => autoGrowTextarea(textarea));
      });
    }
    setFormEditable(form);
    if (!RAGIC_STATE.currentId) {
      form.querySelector('[name="date"]')?.addEventListener('change', () => applySignedInRosterShift({ force: true }));
      applySignedInRosterShift();
    }
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

const renderTrackingRecordText = (value) => {
  const entries = [];
  String(value || '').split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const match = line.match(/^\s*(\d{2}\/\d{2}\/\d{2})\s*(.*)$/);
    if (match) {
      entries.push({ date: match[1], content: match[2] });
    } else if (entries.length && line.trim()) {
      entries[entries.length - 1].content += `\n${line.trimStart()}`;
    } else if (line.trim()) {
      entries.push({ date: '', content: line.trimStart() });
    }
  });
  if (!entries.length) return '';
  return `<div class="tracking-record-list">${entries.map((entry) => `
    <div class="tracking-record-line${entry.date ? '' : ' no-date'}">
      ${entry.date ? `<span class="tracking-record-date">${escapeHtml(entry.date)}</span>` : ''}
      <span class="tracking-record-content">${escapeHtml(entry.content)}</span>
    </div>`).join('')}</div>`;
};

const renderCell = (record, field) => {
  const value = recordListFieldValue(record, field);
  const embeddedImages = imageDataSources(value);
  if (embeddedImages.length) return renderFileCell(embeddedImages, field?.label || '圖片');
  if (field?.listParentKey) {
    return `<span style="white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(String(valueToText(value)))}</span>`;
  }
  if (field?.type === 'image' || field?.type === 'file') return renderFileCell(value, field.label || '圖片');
  if (field?.type === 'file') return value ? `<a class="ragic-file-link" href="${escapeHtml(value.data || value)}" download="${escapeHtml(value.name || 'download')}">📎 ${escapeHtml(value.name || '檔案')} ${escapeHtml(value.size ? `(${formatFileSize(value.size)})` : '')}</a>` : '';
  if (field?.type === 'link') return value ? `<a class="ragic-link" href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>` : '';
  if (field?.type === 'date') return escapeHtml(displayDate(value));
  if (['datetime', 'createdDate', 'updatedDate'].includes(field?.type)) return escapeHtml(displayDateTime(value));
  if (field?.type === 'subtable') {
    const rows = Array.isArray(value) ? value : [];
    const subfields = Array.isArray(field.fields) ? field.fields : [];
    const text = rows.map((row) => {
      const orderedValues = subfields.length
        ? subfields.map((subfield) => row?.[subfield.key])
        : Object.values(row || {});
      return orderedValues.map((item) => String(valueToText(item))).filter(Boolean).join(' / ');
    }).filter(Boolean).join('\n');
    return `<span style="white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(text)}</span>`;
  }
  const text = String(valueToText(value));
  if (isTrackingModule() && String(field?.label || '').trim() === '紀錄') {
    return renderTrackingRecordText(text);
  }
  if (field?.type === 'textarea') {
  return `<span style="display:block;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(text)}</span>`;
}
  return escapeHtml(text);
};
const IMAGE_PREVIEW_STATE = { sources: [], index: 0, label: '圖片', zoom: 1, x: 0, y: 0, dragging: false };
const applyImagePreviewTransform = () => {
  const image = document.querySelector('#ragicImageModal .ragic-image-stage img');
  if (!image) return;
  image.style.transform = `translate(${IMAGE_PREVIEW_STATE.x}px, ${IMAGE_PREVIEW_STATE.y}px) scale(${IMAGE_PREVIEW_STATE.zoom})`;
  image.classList.toggle('is-zoomed', IMAGE_PREVIEW_STATE.zoom > 1);
  const zoomLabel = document.querySelector('#ragicImageZoom');
  if (zoomLabel) zoomLabel.textContent = `${Math.round(IMAGE_PREVIEW_STATE.zoom * 100)}%`;
};
const resetImagePreviewTransform = () => {
  Object.assign(IMAGE_PREVIEW_STATE, { zoom: 1, x: 0, y: 0, dragging: false });
  applyImagePreviewTransform();
};
const zoomImagePreview = (factor) => {
  IMAGE_PREVIEW_STATE.zoom = Math.min(8, Math.max(0.25, IMAGE_PREVIEW_STATE.zoom * factor));
  if (IMAGE_PREVIEW_STATE.zoom <= 1) {
    IMAGE_PREVIEW_STATE.x = 0;
    IMAGE_PREVIEW_STATE.y = 0;
  }
  applyImagePreviewTransform();
};
const renderImagePreview = () => {
  const modal = document.querySelector('#ragicImageModal');
  if (!modal || !IMAGE_PREVIEW_STATE.sources.length) return;
  const total = IMAGE_PREVIEW_STATE.sources.length;
  const index = Math.min(Math.max(0, IMAGE_PREVIEW_STATE.index), total - 1);
  IMAGE_PREVIEW_STATE.index = index;
  modal.querySelector('h2').textContent = IMAGE_PREVIEW_STATE.label;
  modal.querySelector('img').src = IMAGE_PREVIEW_STATE.sources[index];
  const originalLink = modal.querySelector('#ragicImageOriginal');
  if (originalLink) originalLink.href = IMAGE_PREVIEW_STATE.sources[index];
  resetImagePreviewTransform();
  const counter = modal.querySelector('#ragicImageCounter');
  if (counter) counter.textContent = `${index + 1} / ${total}`;
  modal.querySelectorAll('[data-image-step]').forEach((button) => { button.disabled = total < 2; });
};
const stepImagePreview = (step) => {
  const total = IMAGE_PREVIEW_STATE.sources.length;
  if (total < 2) return;
  IMAGE_PREVIEW_STATE.index = (IMAGE_PREVIEW_STATE.index + step + total) % total;
  renderImagePreview();
};
const openImagePreview = (src, label = '圖片', sources = [src], selectedIndex = 0) => {
  const modal = document.querySelector('#ragicImageModal');
  IMAGE_PREVIEW_STATE.sources = (Array.isArray(sources) ? sources : [src]).filter(Boolean);
  IMAGE_PREVIEW_STATE.index = Math.max(0, selectedIndex);
  IMAGE_PREVIEW_STATE.label = label;
  renderImagePreview();
  modal.hidden = false;
};
const closeImagePreview = () => {
  const modal = document.querySelector('#ragicImageModal');
  if (!modal) return;
  modal.hidden = true;
  modal.querySelector('img').removeAttribute('src');
  IMAGE_PREVIEW_STATE.sources = [];
  IMAGE_PREVIEW_STATE.index = 0;
  resetImagePreviewTransform();
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
const autoFitTrackingListColumns = () => {
  if (!isTrackingModule()) return;
  const table = document.querySelector('#ragicHeaderRow')?.closest('table');
  const headerRow = table?.querySelector('#ragicHeaderRow');
  if (!table || !headerRow) return;

  const context = document.createElement('canvas').getContext('2d');
  if (!context) return;
  const reference = table.querySelector('tbody td, thead th');
  const computed = reference ? getComputedStyle(reference) : null;
  context.font = computed?.font || `${computed?.fontSize || '14px'} ${computed?.fontFamily || 'sans-serif'}`;

  const measureText = (value) => String(value || '')
    .split(/\r?\n/)
    .reduce((max, line) => Math.max(max, context.measureText(line.trim()).width), 0);

  let totalWidth = 76;
  listFields().forEach((field) => {
    const escapedKey = CSS.escape(field.key);
    const header = headerRow.querySelector(`th[data-field-key="${escapedKey}"]`);
    if (!header) return;
    const labelWidth = measureText(header.querySelector('.col-label')?.textContent || field.label || field.key) + 54;
    const contentWidth = [...table.querySelectorAll(`tbody td[data-field-key="${escapedKey}"]`)]
      .reduce((max, cell) => Math.max(max, measureText(cell.innerText || cell.textContent)), 0) + 28;
    const label = String(field.label || '').trim();
    const maximum = field.type === 'textarea' || label === '紀錄'
      ? 500
      : label === '群組名稱'
        ? 360
        : ['date', 'datetime', 'createdDate', 'updatedDate'].includes(field.type)
          ? 190
          : 280;
  const width = label === '紀錄'
    ? 500
    : Math.max(76, Math.min(maximum, Math.ceil(Math.max(labelWidth, contentWidth))));
    totalWidth += width;
  });
  table.style.setProperty('min-width', `${totalWidth}px`);
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
      const isFullTextField = Array.isArray(RAGIC_STATE.config?.fullTextListFields) && RAGIC_STATE.config.fullTextListFields.includes(field.key);
      const columnClass = `${ragicColumnClass(field)}${field.type === 'textarea' ? ' col-textarea' : ''}${isFullTextField ? ' col-fixed-full-text' : ''}`;
      const typeAttr = field.type ? ` data-type="${escapeHtml(field.type)}" data-field-type="${escapeHtml(field.type)}"` : '';
      const title = columnClass === 'col-content' ? ` title="${escapeHtml(cellTooltipText(record, field))}"` : '';
      const width = fieldColumnWidth(field);
      const style = columnWidthStyle(width);
      return `<td class="${columnClass}" data-doc-id="${escapeHtml(record.id)}" data-field-key="${escapeHtml(field.key)}"${typeAttr}${style}${title}>${renderCell(record, field)}</td>`;
    }).join('');
    [...tr.children].forEach((cell, index) => {
      const field = index > 0 ? fields[index - 1] : null;
      const manualWidth = field ? fieldColumnWidth(field) : null;
      cell.style.setProperty('min-width', `${index === 0 ? 50 : (manualWidth || 0)}px`, 'important');
      if (manualWidth) cell.style.setProperty('width', `${manualWidth}px`, 'important');
      if (field) applyListCellAlignment(cell, field);
      const isDateColumn = cell.classList.contains('col-date');
      cell.style.setProperty('white-space', isDateColumn ? 'nowrap' : 'normal', 'important');
      cell.style.setProperty('overflow-wrap', isDateColumn ? 'normal' : 'anywhere', 'important');
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
  autoFitTrackingListColumns();
};
const sortValue = (record, fieldKey) => {
  const field = fieldByKey(fieldKey);
  const raw = recordListFieldValue(record, field || { key: fieldKey });
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
  const field = fieldByKey(fieldKey) || { key: fieldKey };
  const rawValue = recordListFieldValue(record, field);
  if (Array.isArray(filterValue)) {
    if (!filterValue.length) return true;
    const recordValues = Array.isArray(rawValue)
      ? rawValue.map((item) => String(item || '').trim())
      : String(rawValue || '').split('\n').map((item) => item.trim()).filter(Boolean);
    return filterValue.some((option) => recordValues.includes(option));
  }
  const keyword = String(filterValue || '').trim().toLowerCase();
  if (!keyword) return true;
  return valueToText(rawValue).toString().toLowerCase().includes(keyword);
};

const applyFilters = () => {
  const filters = Object.fromEntries(Object.entries(RAGIC_STATE.filters).map(([key, value]) => [key, normalizeFilterValue(value)]).filter(([, value]) => Array.isArray(value) ? value.length : value));
  const trackingStatuses = Array.isArray(RAGIC_STATE.config?.trackingStatuses) ? new Set(RAGIC_STATE.config.trackingStatuses.map((value) => String(value || '').trim().replace(/["']/g, ''))) : null;
  const sourceRecords = trackingStatuses?.size ? RAGIC_STATE.records.filter((record) => trackingStatuses.has(String(record.status || '').trim().replace(/["']/g, ''))) : RAGIC_STATE.records;
  const filtered = sourceRecords.filter((record) => Object.entries(filters).every(([fieldKey, filterValue]) => filterMatchesRecord(record, fieldKey, filterValue)));
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
  if (RAGIC_STATE.config?.fixedSortKey) {
    fieldKey = String(RAGIC_STATE.config.fixedSortKey);
    direction = RAGIC_STATE.config.fixedSortDir === 'asc' ? 'asc' : 'desc';
  }
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
    table.style.tableLayout = 'fixed';
    table.style.setProperty('width', '100%', 'important');
    table.style.setProperty('min-width', '100%', 'important');
    table.style.setProperty('max-width', 'none', 'important');
    applyRagicColumnGroup(table);
  }
  document.querySelector('#ragicFilterRow')?.remove();
  headerRow.innerHTML = `<th class="icon-actions-head col-marker">標記</th>` + listFields().map((field) => {
    const key = escapeHtml(field.key);
    const label = escapeHtml(field.label || field.key);
    const width = fieldColumnWidth(field);
    const style = columnWidthStyle(width);
    const fixedSortKey = String(RAGIC_STATE.config?.fixedSortKey || '');
    const sortControls = fixedSortKey
      ? `<div class="menu-item" aria-disabled="true">🔒 <span>固定依${escapeHtml(fieldByKey(fixedSortKey)?.label || fixedSortKey)}由新到舊</span></div>`
      : `<div class="menu-item" data-menu-action="sort-asc" data-field="${key}">↑ <span>從A到Z排序</span></div><div class="menu-item" data-menu-action="sort-desc" data-field="${key}">↓ <span>從Z到A排序</span></div>`;
    return `<th class="${ragicColumnClass(field)}${field.type === 'textarea' ? ' col-textarea' : ''} col-menu-cell" data-type="${escapeHtml(field.type || '')}" data-field-key="${key}"${style}><span class="col-label">${label}</span><span class="col-menu-trigger" data-field="${key}" role="button" tabindex="0" aria-label="開啟${label}欄位選單">▼</span><span class="col-sort-indicator"></span><div class="col-menu-dropdown" data-menu="${key}" hidden>${sortControls}<div class="menu-item" data-menu-action="clear-filter" data-field="${key}">✕ <span>清除篩選條件</span></div><div class="menu-divider"></div>${renderColumnFilterControls(field)}</div></th>`;
  }).join('');
  [...headerRow.children].forEach((cell, index) => {
    const field = index > 0 ? listFields()[index - 1] : null;
    const manualWidth = field ? fieldColumnWidth(field) : null;
    cell.style.setProperty('min-width', `${index === 0 ? 50 : (manualWidth || 0)}px`, 'important');
    if (manualWidth) cell.style.setProperty('width', `${manualWidth}px`, 'important');
    if (field) applyListCellAlignment(cell, field);
    const isDateColumn = cell.classList.contains('col-date');
    cell.style.setProperty('white-space', isDateColumn ? 'nowrap' : 'normal', 'important');
    cell.style.setProperty('overflow-wrap', isDateColumn ? 'normal' : 'anywhere', 'important');
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
  if (field.type === 'reminderEnabled' || field.type === 'reportEnabled') return '☐';
  return samples[rowIndex] || samples[0];
};
const designerColumnLetter = (index = 0) => {
  let value = Number(index) + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
};
const designerPreviewColumnWidth = (field = {}) => {
  const savedWidth = fieldColumnWidth(field);
  if (savedWidth) return Math.max(80, savedWidth);
  if (field.type === 'textarea') return 320;
  if (field.type === 'link') return 220;
  if (['date', 'datetime', 'createdDate', 'updatedDate'].includes(field.type)) return 170;
  if (['image', 'file'].includes(field.type)) return 130;
  if (['reminderEnabled', 'reportEnabled'].includes(field.type)) return 100;
  if (['select', 'multiselect', 'person'].includes(field.type)) return 150;
  return 140;
};
const normalizeListHorizontalAlign = (value) => ['left', 'center', 'right'].includes(String(value || '')) ? String(value) : '';
const normalizeListVerticalAlign = (value) => ['top', 'middle', 'bottom'].includes(String(value || '')) ? String(value) : '';
const applyListCellAlignment = (cell, field = {}) => {
  if (!cell) return;
  const horizontal = normalizeListHorizontalAlign(field.listHorizontalAlign);
  const vertical = normalizeListVerticalAlign(field.listVerticalAlign);
  if (horizontal) cell.style.setProperty('text-align', horizontal, 'important');
  else cell.style.removeProperty('text-align');
  if (vertical) cell.style.setProperty('vertical-align', vertical, 'important');
  else cell.style.removeProperty('vertical-align');
};

const updateDesignerPreview = () => {
  const modal = document.querySelector('#ragicDesignerModal');
  const body = modal?.querySelector('.designer-body');
  const preview = modal?.querySelector('#designerPreviewTable');
  const hiddenFields = modal?.querySelector('#designerHiddenListFields');
  if (!body || !preview) return;
  const allFields = readDesigner(body).filter((field) => field.type !== 'subtable');
  const fields = allFields.filter((field) => field.listVisible !== false);
  if (hiddenFields) {
    const hidden = allFields.filter((field) => field.listVisible === false);
    hiddenFields.innerHTML = hidden.length
      ? hidden.map((field) => `<button type="button" data-show-list-field="${escapeHtml(field.key)}">＋ ${escapeHtml(field.label || field.key)}</button>`).join('')
      : '<span>全部欄位都顯示在列表</span>';
  }
  if (!fields.length) {
    preview.innerHTML = '<div class="designer-preview-empty">尚未建立欄位，請新增欄位以預覽表格。</div>';
    return;
  }
  const colgroup = fields.map((field) => {
    const width = designerPreviewColumnWidth(field);
    return `<col style="min-width: ${width}px !important; width: ${width}px;">`;
  }).join('');
  const headers = fields.map((field) => `<th class="${ragicColumnClass(field)}" data-list-field-key="${escapeHtml(field.key)}"><span class="designer-list-drag" draggable="true" title="拖曳調整欄位順序">⠿</span><strong class="designer-list-field-label">${escapeHtml(field.label || field.key)}</strong><button class="designer-list-field-settings" type="button" data-list-field-settings="${escapeHtml(field.key)}" title="欄位設定">⚙</button><span class="designer-list-col-resizer" data-list-resize="${escapeHtml(field.key)}" title="拖曳調整欄寬"></span></th>`).join('');
  const columnLetters = fields.map((_, index) => `<th>${designerColumnLetter(index)}</th>`).join('');
  const rows = [0, 1, 2].map((rowIndex) => `<tr><th class="designer-sheet-row-number">${rowIndex + 1}</th>${fields.map((field) => `<td class="${ragicColumnClass(field)}">${escapeHtml(designerPreviewValue(field, rowIndex))}</td>`).join('')}</tr>`).join('');
  preview.innerHTML = `<table class="ragic-table"><colgroup><col class="designer-sheet-index-col">${colgroup}</colgroup><thead><tr class="designer-sheet-column-letters"><th></th>${columnLetters}</tr><tr><th class="designer-sheet-corner">#</th>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  const previewTable = preview.querySelector('.ragic-table');
  if (previewTable) previewTable.style.tableLayout = 'fixed';
  const previewWidth = fields.reduce((sum, field) => sum + designerPreviewColumnWidth(field), 44);
  previewTable?.style.setProperty('width', `${previewWidth}px`, 'important');
  previewTable?.style.setProperty('min-width', `${previewWidth}px`, 'important');
  previewTable?.style.setProperty('max-width', 'none', 'important');
  fields.forEach((field, index) => {
    const width = designerPreviewColumnWidth(field);
    const headerCell = previewTable?.querySelector(`thead tr:not(.designer-sheet-column-letters) th:nth-child(${index + 2})`);
    applyColumnWidth(headerCell, width);
    applyListCellAlignment(headerCell, field);
    applyColumnWidth(previewTable?.querySelector(`thead .designer-sheet-column-letters th:nth-child(${index + 2})`), width);
    previewTable?.querySelectorAll(`tbody td:nth-child(${index + 2})`).forEach((cell) => {
      applyColumnWidth(cell, width);
      applyListCellAlignment(cell, field);
    });
  });
};

const designerRowByKey = (fieldKey) => {
  const escapedKey = window.CSS?.escape ? CSS.escape(fieldKey) : String(fieldKey).replace(/"/g, '\\"');
  return document.querySelector(`#ragicDesignerModal .designer-body > .designer-field[data-field-key="${escapedKey}"], #ragicDesignerModal .designer-body > .designer-field[data-key="${escapedKey}"]`);
};

const openListFieldSettings = (fieldKey) => {
  const row = designerRowByKey(fieldKey);
  const panel = document.querySelector('#designerListFieldPanel');
  if (!row || !panel) return;
  const field = readDesigner(row.parentElement).find((item) => item.key === fieldKey);
  if (!field) return;
  panel.dataset.fieldKey = fieldKey;
  panel.innerHTML = `<div class="designer-list-panel-head"><div><small>列表欄位</small><h3>${escapeHtml(field.label || field.key)}</h3></div><button type="button" data-close-list-settings>×</button></div><label><span>欄位名稱</span><input data-list-setting-label value="${escapeHtml(field.label || '')}"></label><label><span>顯示在列表</span><input data-list-setting-visible type="checkbox" ${field.listVisible === false ? '' : 'checked'}></label><label><span>列表欄寬</span><div class="designer-list-width-input"><input data-list-setting-width type="number" min="40" max="2000" step="10" value="${escapeHtml(normalizeFieldWidth(field.width) ?? '')}" placeholder="自動"><em>px</em></div></label><label><span>水平對齊</span><select data-list-setting-horizontal><option value="" ${!normalizeListHorizontalAlign(field.listHorizontalAlign) ? 'selected' : ''}>沿用目前樣式</option><option value="left" ${field.listHorizontalAlign === 'left' ? 'selected' : ''}>靠左</option><option value="center" ${field.listHorizontalAlign === 'center' ? 'selected' : ''}>置中</option><option value="right" ${field.listHorizontalAlign === 'right' ? 'selected' : ''}>靠右</option></select></label><label><span>垂直對齊</span><select data-list-setting-vertical><option value="" ${!normalizeListVerticalAlign(field.listVerticalAlign) ? 'selected' : ''}>沿用目前樣式</option><option value="top" ${field.listVerticalAlign === 'top' ? 'selected' : ''}>靠上</option><option value="middle" ${field.listVerticalAlign === 'middle' ? 'selected' : ''}>置中</option><option value="bottom" ${field.listVerticalAlign === 'bottom' ? 'selected' : ''}>靠下</option></select></label><p>列表設定不會改變單筆畫面的欄位位置。</p><button class="primary" type="button" data-apply-list-settings>套用並儲存</button>`;
  panel.hidden = false;
};


const SUBTABLE_FIXED_TOTAL_WIDTH = 1000;
const subfieldWidthSummary = (container) => {
  const rows = [...(container?.querySelectorAll(':scope > .designer-field') || [])];
  const widths = rows.map((row) => normalizeFieldWidth(row.querySelector('[data-role="width"]')?.value));
  const total = widths.reduce((sum, width) => sum + (width || 0), 0);
  return {
    total,
    count: rows.length,
    complete: rows.length > 0 && widths.every(Boolean),
    difference: SUBTABLE_FIXED_TOTAL_WIDTH - total
  };
};
const refreshSubfieldWidthSummary = (scope = document) => {
  scope.querySelectorAll('.designer-subfields, .setting-subtable-fields').forEach((section) => {
    const list = section.querySelector('.designer-subfield-list');
    const badge = section.querySelector('[data-subfield-total-width]');
    if (!list || !badge) return;
    const { total, count, complete, difference } = subfieldWidthSummary(list);
    let status = '';
    if (!count) status = '尚未新增子欄位';
    else if (!complete) status = `目前已設定 ${total}px（尚有自動欄寬）`;
    else if (difference === 0) status = '設定完成';
    else if (difference > 0) status = `目前 ${total}px，尚差 ${difference}px`;
    else status = `目前 ${total}px，超過 ${Math.abs(difference)}px`;
    badge.textContent = `欄框總寬度：${SUBTABLE_FIXED_TOTAL_WIDTH}px｜${status}`;
    badge.title = '子表格總寬度固定為 1000px，不受設計表格欄數影響';
    badge.classList.toggle('is-complete', complete && difference === 0);
    badge.classList.toggle('is-invalid', Boolean(count) && (!complete || difference !== 0));
  });
};
const syncSubtableParentWidth = (subfieldList) => {
  const section = subfieldList?.closest('.designer-subfields, .setting-subtable-fields');
  if (!section) return;
  if (section.classList.contains('designer-subfields')) {
    const parentRow = section.closest('.designer-field');
    const widthInput = parentRow?.querySelector(':scope > .designer-width [data-role="width"]');
    if (widthInput) widthInput.value = SUBTABLE_FIXED_TOTAL_WIDTH;
  } else if (section.classList.contains('setting-subtable-fields')) {
    const layoutWidth = section.closest('#layoutFieldSettingsPanel')?.querySelector('[data-layout-width]');
    if (layoutWidth) layoutWidth.value = SUBTABLE_FIXED_TOTAL_WIDTH;
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
    const subfieldType =
  SUBFIELD_TYPES.some((type) => type.value === field.type)
    ? field.type
    : 'text';

const typeOptions = SUBFIELD_TYPE_GROUPS.map((group) => {
  const options = group.types.map((type) => {
    return `
      <option
        value="${escapeHtml(type.value)}"
        ${subfieldType === type.value ? 'selected' : ''}
      >
        ${escapeHtml(type.label)}
      </option>
    `;
  }).join('');

  return `
    <optgroup label="${escapeHtml(group.label)}">
      ${options}
    </optgroup>
  `;
}).join('');
    row.innerHTML = `<span class="drag-handle" title="拖拉排序" aria-label="拖拉排序">⠿</span><input data-role="label" placeholder="子欄位名稱" value="${escapeHtml(field.label || '')}"><select data-role="type">${typeOptions}</select><textarea class="designer-subfield-options" data-role="options" rows="3" placeholder="選項，每行一個" ${['select', 'multiselect'].includes(subfieldType) ? '' : 'hidden'}>${escapeHtml(optionList(field).join('\n'))}</textarea><label class="designer-width" title="儲存後同步套用到檢視與編輯子表格"><span>欄寬</span><input data-role="width" type="number" min="40" max="1200" step="10" inputmode="numeric" placeholder="例如 200" value="${escapeHtml(normalizeFieldWidth(field.width) ?? '')}"><span>px</span></label><div class="designer-actions"><button class="ghost danger" data-remove type="button">刪除</button></div>`;
    const syncSubfieldOptions = () => {
      const supportsOptions = ['select', 'multiselect'].includes(row.querySelector('[data-role="type"]').value);
      row.querySelector('[data-role="options"]').hidden = !supportsOptions;
    };
    row.querySelector('[data-role="type"]').addEventListener('change', syncSubfieldOptions);
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
  const listVisibleInput = document.createElement('input');
  listVisibleInput.type = 'hidden';
  listVisibleInput.dataset.role = 'list-visible';
  listVisibleInput.value = field.listVisible === false ? '0' : '1';
  row.appendChild(listVisibleInput);
  const listHorizontalInput = document.createElement('input');
  listHorizontalInput.type = 'hidden';
  listHorizontalInput.dataset.role = 'list-horizontal-align';
  listHorizontalInput.value = normalizeListHorizontalAlign(field.listHorizontalAlign);
  row.appendChild(listHorizontalInput);
  const listVerticalInput = document.createElement('input');
  listVerticalInput.type = 'hidden';
  listVerticalInput.dataset.role = 'list-vertical-align';
  listVerticalInput.value = normalizeListVerticalAlign(field.listVerticalAlign);
  row.appendChild(listVerticalInput);
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
  const width = normalizeFieldWidth(row.querySelector('[data-role="width"]')?.value);
  const field = {
    key: shouldRegenerateFieldKey(row.dataset.key) ? generateFieldKey() : row.dataset.key,
    label,
    type,
    required: Boolean(row.querySelector('[data-role="required"]')?.checked),
    width,
    manualWidth: Boolean(width),
    options: (row.querySelector('[data-role="options"]')?.value || '').split('\n').map((v) => v.trim()).filter(Boolean),
    defaultValue: row.querySelector('[data-role="default"]')?.value || '',
    help: row.querySelector('[data-role="help"]')?.value || '',
    readonly: row.querySelector('[data-role="readonly"]')?.value === '1',
    hidden: row.querySelector('[data-role="hidden"]')?.value === '1',
    listVisible: row.querySelector('[data-role="list-visible"]')?.value !== '0',
    listHorizontalAlign: normalizeListHorizontalAlign(row.querySelector('[data-role="list-horizontal-align"]')?.value),
    listVerticalAlign: normalizeListVerticalAlign(row.querySelector('[data-role="list-vertical-align"]')?.value)
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
  const gridRect = grid.getBoundingClientRect();
  const styles = getComputedStyle(grid);
  const fallbackGapX = Number.parseFloat(styles.columnGap) || 0;
  const fallbackGapY = Number.parseFloat(styles.rowGap) || 0;
  const firstSlot = grid.querySelector('.layout-grid-slot[data-row="1"][data-col="1"]');
  const secondColSlot = grid.querySelector('.layout-grid-slot[data-row="1"][data-col="2"]');
  const secondRowSlot = grid.querySelector('.layout-grid-slot[data-row="2"][data-col="1"]');
  const firstRect = firstSlot?.getBoundingClientRect();
  const secondColRect = secondColSlot?.getBoundingClientRect();
  const secondRowRect = secondRowSlot?.getBoundingClientRect();
  if (firstRect?.width && firstRect?.height) {
    const gapX = secondColRect ? Math.max(0, secondColRect.left - firstRect.right) : fallbackGapX;
    const gapY = secondRowRect ? Math.max(0, secondRowRect.top - firstRect.bottom) : fallbackGapY;
    return {
      rect: { left: firstRect.left, top: firstRect.top, width: grid.scrollWidth, height: grid.scrollHeight },
      gapX,
      gapY,
      cellW: firstRect.width,
      cellH: firstRect.height
    };
  }
  const columns = Number(grid.dataset.columns) || 1;
  const rows = Number(grid.dataset.rows) || 1;
  return {
    rect: gridRect,
    gapX: fallbackGapX,
    gapY: fallbackGapY,
    cellW: (gridRect.width - fallbackGapX * (columns - 1)) / columns,
    cellH: (gridRect.height - fallbackGapY * (rows - 1)) / rows
  };
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
    const useDesignerPixelHeight =
      item.height &&
      !(isTrackingModule() && field.type === 'subtable');
    const size =
  `${useDesignerPixelHeight
    ? `height:${item.height}px;min-height:${item.height}px;`
    : ''}`;
    return `<div class="layout-field ${field.type === 'subtable' ? 'layout-field-subtable' : ''}" draggable="false" ${fixedLogField ? 'data-layout-locked="true"' : ''} data-field-key="${escapeHtml(field.key)}" style="grid-column:${item.col} / span ${item.colSpan};grid-row:${item.row} / span ${item.rowSpan};${size}"><span class="layout-drag-grip" title="拖曳欄位" aria-label="拖曳欄位">⠿</span><b>${escapeHtml(field.label || field.key)}</b><small>${escapeHtml(layoutFieldTypeLabel(field.type))}</small>${field.type === 'subtable' ? '<button class="subtable-edit-btn" type="button">編輯子表格</button>' : ''}<button class="settings-btn" type="button" title="設定">⚙️</button>${fixedLogField ? '' : '<button class="remove-btn" type="button" title="移除">×</button><span class="resize-handle-right" data-resize="col"></span><span class="resize-handle-bottom" data-resize="row"></span><span class="resize-handle-corner" data-resize="both"></span>'}</div>`;
  }).join('');
  const unplaced = fields.filter((field) => !placed.has(field.key)).map((field) => `<div class="layout-field-chip ${field.type === 'subtable' ? 'layout-field-chip-subtable' : ''}" draggable="false" data-field-key="${escapeHtml(field.key)}"><span class="layout-chip-grip">⠿</span><b>${escapeHtml(field.label || field.key)}</b><small>${escapeHtml(layoutFieldTypeLabel(field.type))}</small><button class="settings-btn" type="button" aria-label="編輯欄位">⚙️</button><button class="remove-btn" type="button" aria-label="移除欄位">×</button></div>`).join('') || '<span class="layout-empty">全部欄位都已放置</span>';
  const normalFieldTypeButtons = FIELD_TYPES.map((type) => `
  <button
    class="layout-type-button"
    data-add-layout-field
    data-field-type="${escapeHtml(type.value)}"
    type="button"
  >
    <span>${escapeHtml(type.label)}</span>
  </button>
`).join('');

const pairFieldTypeButtons = FIELD_PAIR_TYPES.map((type) => `
  <button
    class="layout-type-button"
    data-add-layout-pair
    data-pair-type="${type.value}"
    type="button"
  >
    <span>${type.label}</span>
  </button>
`).join('');

const fieldTypeButtons =
  normalFieldTypeButtons + pairFieldTypeButtons;
  panel.innerHTML = `<div class="layout-designer"><div class="layout-toolbar"><div class="layout-toolbar-controls"><label>欄數：<select id="gridCols" ${fixedLogLayout ? 'disabled' : ''}>${colsSelect}</select></label><label>列數：<select id="gridRows" ${fixedLogLayout ? 'disabled' : ''}>${rowsSelect}</select></label></div><div class="layout-toolbar-actions"><button class="primary layout-add-toggle" data-toggle-layout-add type="button">＋ 新增欄位</button></div></div><div class="layout-unplaced"><span class="layout-section-label">未放置的欄位：</span><div class="layout-unplaced-fields">${unplaced}</div></div><div class="layout-workbench"><main class="layout-canvas"><div class="layout-grid-section"><h3>排版表格（拖曳欄位到表格中，可調整大小、跨欄跨列） 欄框設置131x48</h3><div class="layout-grid" data-columns="${layout.columns}" data-rows="${layout.rows}" aria-label="排版表格拖曳區" style="grid-template-columns:repeat(${layout.columns}, 131px);grid-template-rows:repeat(${layout.rows}, 48px);">${gridLines.join('')}${placedFields}</div></div></main><aside class="layout-side-panel"><section class="layout-add-card layout-add-popover" hidden><div class="layout-add-card-head"><div><h3>新增欄位</h3><p>選擇欄位類型</p></div><button class="secondary layout-add-close" data-close-layout-add type="button">關閉</button></div><div class="layout-type-grid">${fieldTypeButtons}</div></section><aside id="layoutFieldSettingsPanel" class="layout-field-settings layout-settings-popover" hidden></aside></aside></div></div>`;
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
  panel.innerHTML = `<div class="layout-settings-head"><h3>欄位屬性設定</h3><div class="layout-settings-head-actions"><button class="primary" data-confirm-settings type="button">確認並儲存</button><button class="danger" data-remove-settings-field type="button">刪除欄位</button><button class="secondary" data-close-layout-settings type="button">關閉</button></div></div><label>欄位名稱<input data-setting-label value="${escapeHtml(field.label || '')}"></label><label>欄位類型<select data-setting-type>${typeSelectOptions(field.type)}</select></label><div class="setting-options" ${['select','multiselect'].includes(field.type) ? '' : 'hidden'}><span>選項:</span><textarea data-option-list data-option rows="7" placeholder="每行一個選項">${escapeHtml(options)}</textarea></div><input data-setting-default type="hidden" value="${escapeHtml(field.defaultValue || '')}"><input data-setting-help type="hidden" value="${escapeHtml(field.help || '')}"><input data-layout-row type="hidden" value="${escapeHtml(item.row || 1)}"><input data-layout-col type="hidden" value="${escapeHtml(item.col || 1)}"><input data-layout-rowspan type="hidden" value="${escapeHtml(item.rowSpan || 1)}"><input data-layout-colspan type="hidden" value="${escapeHtml(item.colSpan || 1)}"><input data-layout-width type="hidden" value="${escapeHtml(item.width || field.formWidth || '')}"><input data-layout-height type="hidden" value="${escapeHtml(layoutHeightValue(item, field))}"><input data-setting-required type="hidden" value="${field.required ? '1' : ''}"><input data-setting-readonly type="hidden" value="${field.readonly ? '1' : ''}"><input data-setting-hidden type="hidden" value="${field.hidden ? '1' : ''}">${field.type === 'subtable' ? '<section class="setting-subtable-fields"><div class="designer-subfields-head"><h4>子欄位設定</h4><span class="designer-subfield-total" data-subfield-total-width>欄框總寬度：0px</span><label class="designer-columns-per-row"><span>每列顯示</span><input data-setting-columns-per-row type="number" min="1" max="10" step="1" inputmode="numeric" value="' + escapeHtml(normalizeSubtableColumnsPerRow(field.columnsPerRow)) + '"><span>個欄位</span></label></div><div class="designer-subfield-list" data-setting-subfields></div><button class="secondary" data-add-setting-subfield type="button">+ 新增子欄位</button></section>' : ''}`;
  panel.querySelector('[data-setting-type]')?.closest('label')?.insertAdjacentHTML('afterend', `<section class="designer-list-settings"><div class="designer-list-settings-head"><strong>列表顯示設定</strong><span>只影響列表，欄位仍會保留在表單中</span></div><label class="designer-list-visible"><span>顯示在列表</span><input data-setting-list-visible type="checkbox" ${field.listVisible === false ? '' : 'checked'}><i aria-hidden="true"></i></label><label class="designer-list-width"><span>列表欄寬</span><div><input data-setting-list-width type="number" min="40" max="2000" step="10" inputmode="numeric" placeholder="自動" value="${escapeHtml(normalizeFieldWidth(field.width) ?? '')}"><em>px</em></div></label></section>`);
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
  if (fields.some((field) => field.type === 'subtable')) { if (col !== 1) row += 1; fields.filter((field) => field.type === 'subtable').forEach((field) => { layout.fields[field.key] = { row, col: 1, colSpan: layout.columns, rowSpan: 1, height: isTrackingModule() ? null : defaultFormFieldHeight(field) }; row += 1; }); }
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
    if (source.dataset.layoutLocked === 'true') return;
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
  let layoutResizeActive = false;
  const beginLayoutResize = (event) => {
    const handle = event.target.closest('[data-resize]');
    if (!handle || layoutResizeActive) return;
    event.preventDefault();
    event.stopPropagation();
    const fieldKey = handle.closest('[data-field-key]')?.dataset.fieldKey;
    const grid = panel.querySelector('.layout-grid');
    const startLayout = currentDesignerLayout();
    const start = { ...startLayout.fields[fieldKey] };
    if (!fieldKey || !grid || !start.row) return;
    layoutResizeActive = true;
    const startX = event.clientX;
    const startY = event.clientY;
    const type = handle.dataset.resize;
    const metrics = getLayoutCellMetrics(grid);
    let latestCandidate = { ...start };
    let latestRows = startLayout.rows;
    const candidateAt = (clientX, clientY) => {
      const resizeStep = (distance, unit) => {
        const deadZone = 4;
        const absoluteDistance = Math.abs(distance);
        if (absoluteDistance < deadZone) return 0;
        const steps = 1 + Math.floor((absoluteDistance - deadZone) / Math.max(1, unit));
        return distance > 0 ? steps : -steps;
      };
      const dCol = resizeStep(clientX - startX, metrics.cellW + metrics.gapX);
      const dRow = resizeStep(clientY - startY, metrics.cellH + metrics.gapY);
      const next = { ...start };
      let candidateRows = startLayout.rows;
      if (type === 'col' || type === 'both') {
        next.colSpan = Math.min(startLayout.columns - next.col + 1, Math.max(1, start.colSpan + dCol));
      }
      if (type === 'row' || type === 'both') {
        const desiredRowSpan = Math.max(1, start.rowSpan + dRow);
        candidateRows = Math.min(10, Math.max(startLayout.rows, start.row + desiredRowSpan - 1));
        next.rowSpan = Math.min(candidateRows - next.row + 1, desiredRowSpan);
      }
      return {
        candidate: clampLayoutItem(next, { ...startLayout, rows: candidateRows }),
        rows: candidateRows
      };
    };
    const showResizePreview = (candidate) => {
      grid.querySelector('.layout-drop-preview')?.remove();
      const preview = document.createElement('div');
      preview.className = `layout-drop-preview ${isLayoutAreaFree(startLayout, fieldKey, candidate) ? 'is-valid' : 'is-invalid'}`;
      preview.style.cssText = `grid-column:${candidate.col} / span ${candidate.colSpan};grid-row:${candidate.row} / span ${candidate.rowSpan};`;
      grid.appendChild(preview);
    };
    const cleanup = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      grid.querySelector('.layout-drop-preview')?.remove();
      handle.classList.remove('resizing');
      layoutResizeActive = false;
    };
    const move = (moveEvent) => {
      moveEvent.preventDefault();
      const result = candidateAt(moveEvent.clientX, moveEvent.clientY);
      latestCandidate = result.candidate;
      latestRows = result.rows;
      handle.classList.add('resizing');
      showResizePreview(latestCandidate);
    };
    const up = (upEvent) => {
      const result = candidateAt(upEvent.clientX, upEvent.clientY);
      latestCandidate = result.candidate;
      latestRows = result.rows;
      cleanup();
      updateLayoutDesignerState((layout) => {
        layout.rows = Math.max(layout.rows, latestRows);
        const current = layout.fields[fieldKey];
        const candidate = clampLayoutItem(latestCandidate, layout);
        if (!current) return;

        if (!isLayoutAreaFree(layout, fieldKey, candidate) && candidate.rowSpan > current.rowSpan) {
          const currentBottom = current.row + current.rowSpan;
          const normalizedEntries = Object.entries(layout.fields || {})
            .filter(([key]) => key !== fieldKey)
            .map(([key, item]) => [key, item, clampLayoutItem(item, layout)]);
          const conflicts = normalizedEntries
            .filter(([, , item]) => layoutCellsOverlap(candidate, item));
          const canPushDown =
            conflicts.length > 0 &&
            conflicts.every(([, , item]) => item.row >= currentBottom);

          if (canPushDown) {
            const firstBlockedRow = Math.min(...conflicts.map(([, , item]) => item.row));
            const shiftRows = candidate.row + candidate.rowSpan - firstBlockedRow;
            const fieldsToPush = normalizedEntries
              .filter(([, , item]) => item.row >= firstBlockedRow);
            const pushedBottom = fieldsToPush.reduce(
              (maximum, [, , item]) => Math.max(maximum, item.row + shiftRows + item.rowSpan - 1),
              layout.rows
            );

            if (pushedBottom <= 10) {
              fieldsToPush.forEach(([, original]) => {
                original.row = normalizeFormLayoutNumber(original.row, { min: 1, max: 10, fallback: 1 }) + shiftRows;
              });
              layout.rows = Math.max(layout.rows, pushedBottom);
            }
          }
        }

        if (isLayoutAreaFree(layout, fieldKey, candidate)) {
          layout.fields[fieldKey] = candidate;
        }
      });
    };
    const cancel = () => cleanup();
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('mousemove', move, { passive: false });
    document.addEventListener('mouseup', up);
  };
  panel.addEventListener('pointerdown', beginLayoutResize);
  panel.addEventListener('mousedown', beginLayoutResize);
};

const openDesigner = async () => {
  const modal = document.querySelector('#ragicDesignerModal');
  const body = modal?.querySelector('.designer-body');
  const layoutPanel = modal?.querySelector('#layoutDesignerPanel');

  if (!modal || !body) {
    console.error('找不到設計表格視窗');
    alert('無法開啟設計表格，請重新整理頁面');
    return;
  }

  // 必須先顯示視窗，避免後續程式錯誤導致完全沒反應
  modal.hidden = false;
  modal.style.display = 'flex';

  try {
    body.innerHTML = '';

    const fields = getFields();
    const listVisibility = RAGIC_STATE.schema?.listVisibility || {};
    // Mirror the list that is actually visible on screen. The header may
    // still use the page's configured listColumns while an asynchronously
    // loaded schema contains an older listOrder; calling listFields() again
    // would make the designer disagree with the displayed list.
    const renderedListKeys = [...document.querySelectorAll('#ragicHeaderRow th[data-field-key]')]
      .map((cell) => String(cell.dataset.fieldKey || '').trim())
      .filter(Boolean);
    const currentListFields = listFields();
    const currentListKeyOrder = renderedListKeys.length
      ? renderedListKeys
      : currentListFields.map((field) => field.key);
    const currentListKeys = new Set(currentListKeyOrder);
    const fieldMap = new Map(fields.map((field) => [field.key, field]));
    const orderedFields = [
      ...currentListKeyOrder.map((key) => fieldMap.get(key)).filter(Boolean),
      ...fields.filter((field) => !currentListKeys.has(field.key))
    ];

    orderedFields.forEach((field) => {
      try {
        body.appendChild(fieldDesigner({
          ...field,
          listVisible: currentListKeys.has(field.key) && listVisibility[field.key] !== false
        }));
      } catch (fieldError) {
        console.error('建立設計欄位失敗：', field, fieldError);
      }
    });

    body.hidden = true;

    if (layoutPanel) {
      layoutPanel.hidden = true;
    }

    modal.querySelectorAll('[data-designer-tab]').forEach((tab) => tab.classList.toggle('active', tab.dataset.designerTab === 'list'));
    modal.querySelectorAll('[data-designer-panel]').forEach((designerPanel) => { designerPanel.hidden = designerPanel.dataset.designerPanel !== 'list'; });

    renderLayoutDesigner();
    updateDesignerPreview();
  } catch (error) {
    console.error('開啟設計表格失敗：', error);

    body.hidden = false;
    body.innerHTML = `
      <div style="padding:20px;">
        <h3>設計表格載入失敗</h3>
        <p>${escapeHtml(error?.message || '未知錯誤')}</p>
      </div>
    `;
  }
};
const closeDesigner = () => {
  const modal = document.querySelector('#ragicDesignerModal');

  if (!modal) return;

  modal.hidden = true;
  modal.style.display = '';
};


const waitForPermissions = async () => {
  if (window.permissionReady) await window.permissionReady;
};

const applyRagicPermissionUi = () => {
  const newRecordButton = document.querySelector('#newRecordButton');
  newRecordButton?.toggleAttribute('hidden', !canUse('edit'));
  if (newRecordButton) newRecordButton.disabled = !canUse('edit') || newRecordButton.dataset.schemaReady !== 'true';
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
    if (manualSystemDateField(field)) {
      data[field.key] = data[field.key] || existingData[field.key] || currentDateTimeInputValue();
      continue;
    }
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
  RAGIC_STATE.config = { ...config, collection: dataCollectionName(config), schemaCollection: schemaCollectionName(config) }; RAGIC_STATE.filters = { ...(config.initialFilters || {}) }; RAGIC_STATE.sortKey = String(config.fixedSortKey || ''); RAGIC_STATE.sortDir = config.fixedSortDir === 'asc' ? 'asc' : 'desc'; document.body?.classList.toggle('is-log-module', isLogModule(RAGIC_STATE.config)); RAGIC_STATE.pageSize = Number(localStorage.getItem(ragicPageSizeKey())) || 50; const db = window.omniplayDb; const collection = db?.collection(RAGIC_STATE.config.collection); RAGIC_STATE.collection = collection; const schemaDoc = db?.collection(RAGIC_STATE.config.schemaCollection).doc('active'); RAGIC_STATE.schemaDoc = schemaDoc;
  window.toggleFire = async (docId) => { const doc = await collection.doc(docId).get(); await collection.doc(docId).update({ fire: !doc.data()?.fire }); };
  window.togglePin = async (docId) => {
    const currentUser = currentRagicUser();
    if (!currentUser) return alert('請先登入再使用個人釘選');
    const doc = await collection.doc(docId).get();
    await collection.doc(docId).update({ [`pins.${currentUser}`]: !doc.data()?.pins?.[currentUser] });
  };
  
  const saveDesignerSchema = async ({ close = false } = {}) => {
  if (!canUse('design')) {
    alert('您沒有設計權限');
    return false;
  }

  const designerBody = document.querySelector(
    '#ragicDesignerModal .designer-body'
  );

  if (!designerBody || !schemaDoc) {
    alert('找不到表格設計資料，請重新整理後再試');
    return false;
  }

  try {
    const fields = readDesigner(designerBody);
    const listVisibility = Object.fromEntries(fields.filter((field) => field.key).map((field) => [field.key, field.listVisible !== false]));
    const listOrder = fields
      .filter((field) => field.key && field.type !== 'subtable' && field.listVisible !== false)
      .map((field) => field.key);

    /*
     * 直接取得目前設計器最新排版，
     * 不再只使用可能尚未更新的舊 formLayout。
     */
    const formLayout = normalizeDesignerFormLayout(
      RAGIC_STATE.schema?.formLayout || {},
      fields
    );

    const nextSchema = normalizeSchema({
      fields,
      formLayout,
      listVisibility,
      listOrder
    });

    RAGIC_STATE.schema = {
      ...nextSchema,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await schemaDoc.set(
      {
        fields: RAGIC_STATE.schema.fields,
        formLayout: RAGIC_STATE.schema.formLayout,
        listWidth: RAGIC_STATE.schema.listWidth,
        listWidthFull: RAGIC_STATE.schema.listWidthFull,
        listVisibility: RAGIC_STATE.schema.listVisibility,
        listOrder: RAGIC_STATE.schema.listOrder,
        updatedAt: RAGIC_STATE.schema.updatedAt
      },
      { merge: true }
    );

    renderHeader();
    applyFilters();

    if (close) closeDesigner();

    alert('表格設計已儲存');
    return true;
  } catch (error) {
    console.error('儲存表格設計失敗：', error);
    alert(`儲存表格設計失敗：${error?.message || '未知錯誤'}`);
    return false;
  }
};
  
  document.querySelector('#ragicTitle').textContent = config.title; document.querySelector('#ragicSubtitle').textContent = Array.isArray(config.trackingStatuses) && config.trackingStatuses.length ? `目前篩選：${config.trackingStatuses.join('／')}` : `${config.title}列表、動態表單與表格設計維護`;
  const topbarActions = ensureTopbarActions();
  const listToolbar = document.querySelector('#ragicListView .ragic-toolbar');
  const newRecordButton = document.querySelector('#newRecordButton');
  if (newRecordButton) {
    newRecordButton.dataset.schemaReady = 'false';
    newRecordButton.disabled = true;
    newRecordButton.textContent = '載入欄位中…';
  }
  const designButton = document.querySelector('#designTableButton');
  const designHost = listToolbar || topbarActions;
  if (designHost && canUse('design')) {
    const button = designButton || document.createElement('button');
    const userPill = topbarActions?.querySelector('.user-pill');
    button.className = 'secondary';
    button.id = 'designTableButton';
    button.type = 'button';
    button.textContent = '⚙️ 設計表格';
    button.hidden = false;
    button.disabled = false;
    if (listToolbar && button.parentElement !== listToolbar) listToolbar.insertBefore(button, newRecordButton || null);
    else if (!button.parentElement) topbarActions?.insertBefore(button, userPill || null);
  } else {
    designButton?.remove();
  }
  if (!document.querySelector('#ragicDesignerModal')) {
  document.querySelector('body').insertAdjacentHTML('beforeend', '<div class="ragic-modal" id="ragicDesignerModal" hidden><div class="ragic-modal-card"><div class="ragic-form-toolbar"><div><h2>設計表格</h2><p>列表與單筆畫面分開設計</p></div><div class="designer-header-actions"><button class="primary" id="saveSchemaButton" type="button">儲存</button><button class="ghost" id="closeDesignerButton" type="button">關閉</button></div></div><div class="ragic-designer-tabs" role="tablist"><button class="active" data-designer-tab="list" type="button">▦ 列表設計</button><button data-designer-tab="form" type="button">▤ 單筆畫面設計</button></div><div class="designer-body" hidden></div><section class="ragic-list-designer" data-designer-panel="list"><aside class="ragic-list-designer-sidebar"><h3>列表設定</h3><p>點選欄位標題設定顯示與欄寬。</p><div id="designerListFieldPanel" hidden></div><section class="designer-hidden-fields"><h4>未顯示在列表</h4><div id="designerHiddenListFields"></div></section></aside><main class="ragic-list-designer-canvas"><div class="ragic-sheet-title"><strong>資料列表</strong><span>拖曳標題可排序；拖曳欄位右側邊界可調整寬度</span></div><div class="designer-preview-scroll"><div id="designerPreviewTable"></div></div></main></section><div id="layoutDesignerPanel" data-designer-panel="form" hidden></div></div></div>');
  }
  if (!document.querySelector('#ragicImageModal')) {
    document.querySelector('body').insertAdjacentHTML('beforeend', '<div class="ragic-modal" id="ragicImageModal" hidden><div class="ragic-modal-card ragic-image-modal-card"><div class="ragic-form-toolbar"><h2>圖片</h2><div class="ragic-image-counter" id="ragicImageCounter">1 / 1</div><div class="ragic-image-tools"><button class="ghost" data-image-zoom="out" type="button" aria-label="縮小">−</button><span id="ragicImageZoom">100%</span><button class="ghost" data-image-zoom="in" type="button" aria-label="放大">＋</button><button class="ghost" data-image-reset type="button">原始比例</button><a class="ghost" id="ragicImageOriginal" target="_blank" rel="noopener">開啟圖片</a><button class="ghost" data-image-fullscreen type="button">全螢幕</button></div><button class="ghost" id="closeImageModalButton" type="button">關閉</button></div><div class="ragic-image-stage"><button class="ragic-image-nav ragic-image-prev" data-image-step="-1" type="button" aria-label="上一張">‹</button><img alt="圖片預覽" draggable="false"><button class="ragic-image-nav ragic-image-next" data-image-step="1" type="button" aria-label="下一張">›</button></div></div></div>');
  }
  document.querySelector('#designTableButton')?.addEventListener('click', openDesigner);
  document.querySelector('#closeDesignerButton')?.addEventListener('click', closeDesigner);
  document.querySelector('#closeImageModalButton')?.addEventListener('click', closeImagePreview);
  document.querySelector('#ragicImageModal')?.addEventListener('click', (event) => { const button = event.target.closest('[data-image-step]'); if (button) stepImagePreview(Number(button.dataset.imageStep)); });
  document.querySelector('#ragicImageModal')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-image-zoom="in"]')) zoomImagePreview(1.25);
    if (event.target.closest('[data-image-zoom="out"]')) zoomImagePreview(0.8);
    if (event.target.closest('[data-image-reset]')) resetImagePreviewTransform();
    if (event.target.closest('[data-image-fullscreen]')) document.querySelector('#ragicImageModal .ragic-image-modal-card')?.requestFullscreen?.();
  });
  const imageStage = document.querySelector('#ragicImageModal .ragic-image-stage');
  imageStage?.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomImagePreview(event.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });
  imageStage?.addEventListener('pointerdown', (event) => {
    if (!event.target.matches('img') || IMAGE_PREVIEW_STATE.zoom <= 1) return;
    IMAGE_PREVIEW_STATE.dragging = true;
    IMAGE_PREVIEW_STATE.startX = event.clientX - IMAGE_PREVIEW_STATE.x;
    IMAGE_PREVIEW_STATE.startY = event.clientY - IMAGE_PREVIEW_STATE.y;
    event.target.setPointerCapture?.(event.pointerId);
  });
  imageStage?.addEventListener('pointermove', (event) => {
    if (!IMAGE_PREVIEW_STATE.dragging) return;
    IMAGE_PREVIEW_STATE.x = event.clientX - IMAGE_PREVIEW_STATE.startX;
    IMAGE_PREVIEW_STATE.y = event.clientY - IMAGE_PREVIEW_STATE.startY;
    applyImagePreviewTransform();
  });
  imageStage?.addEventListener('pointerup', () => { IMAGE_PREVIEW_STATE.dragging = false; });
  imageStage?.addEventListener('dblclick', () => IMAGE_PREVIEW_STATE.zoom > 1 ? resetImagePreviewTransform() : zoomImagePreview(2));
  document.querySelector('#ragicImageModal')?.addEventListener('click', (event) => { if (event.target.id === 'ragicImageModal') closeImagePreview(); });
  document.addEventListener('keydown', (event) => { if (document.querySelector('#ragicImageModal:not([hidden])')) { if (event.key === 'ArrowLeft') stepImagePreview(-1); if (event.key === 'ArrowRight') stepImagePreview(1); if (event.key === 'Escape') closeImagePreview(); } });
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
    if (mode === 'form') renderLayoutDesigner();
    if (mode === 'list') updateDesignerPreview();
  });
  const setDesignerListFieldWidth = (fieldKey, rawWidth, refreshPreview = true) => {
    const row = designerRowByKey(fieldKey);
    const widthInput = row?.querySelector('[data-role="width"]');
    if (!row || !widthInput) return null;
    const parsedWidth = normalizeFieldWidth(rawWidth);
    const width = parsedWidth ? Math.max(40, Math.min(2000, parsedWidth)) : null;
    widthInput.value = width ?? '';
    const panel = document.querySelector('#designerListFieldPanel');
    if (panel?.dataset.fieldKey === fieldKey) {
      const panelWidthInput = panel.querySelector('[data-list-setting-width]');
      if (panelWidthInput && panelWidthInput !== document.activeElement) panelWidthInput.value = width ?? '';
    }
    if (refreshPreview) updateDesignerPreview();
    return width;
  };
  document.querySelector('#ragicDesignerModal')?.addEventListener('input', (event) => {
    const widthInput = event.target.closest('[data-list-setting-width]');
    if (!widthInput) return;
    const panel = widthInput.closest('#designerListFieldPanel');
    if (!panel?.dataset.fieldKey) return;
    setDesignerListFieldWidth(panel.dataset.fieldKey, widthInput.value);
  });
  document.querySelector('#ragicDesignerModal')?.addEventListener('click', async (event) => {
    const settingsButton = event.target.closest('[data-list-field-settings]');
    const header = event.target.closest('th[data-list-field-key]');
    if (settingsButton || (header && !event.target.closest('[data-list-resize]'))) {
      openListFieldSettings(settingsButton?.dataset.listFieldSettings || header.dataset.listFieldKey);
      return;
    }
    const showButton = event.target.closest('[data-show-list-field]');
    if (showButton) {
      const row = designerRowByKey(showButton.dataset.showListField);
      if (row) row.querySelector('[data-role="list-visible"]').value = '1';
      updateDesignerPreview();
      openListFieldSettings(showButton.dataset.showListField);
      return;
    }
    if (event.target.closest('[data-close-list-settings]')) {
      document.querySelector('#designerListFieldPanel').hidden = true;
      return;
    }
    const applyButton = event.target.closest('[data-apply-list-settings]');
    if (applyButton) {
      const panel = applyButton.closest('#designerListFieldPanel');
      const row = designerRowByKey(panel?.dataset.fieldKey);
      if (!panel || !row || applyButton.disabled) return;
      row.querySelector('[data-role="label"]').value = panel.querySelector('[data-list-setting-label]').value.trim() || '未命名欄位';
      row.querySelector('[data-role="list-visible"]').value = panel.querySelector('[data-list-setting-visible]').checked ? '1' : '0';
      row.querySelector('[data-role="list-horizontal-align"]').value = normalizeListHorizontalAlign(panel.querySelector('[data-list-setting-horizontal]').value);
      row.querySelector('[data-role="list-vertical-align"]').value = normalizeListVerticalAlign(panel.querySelector('[data-list-setting-vertical]').value);
      setDesignerListFieldWidth(panel.dataset.fieldKey, panel.querySelector('[data-list-setting-width]').value, false);
      updateDesignerPreview();
      applyButton.disabled = true;
      applyButton.textContent = '儲存中…';
      const saved = await saveDesignerSchema();
      applyButton.disabled = false;
      applyButton.textContent = saved ? '已套用並儲存 ✓' : '套用並儲存';
      if (saved) {
        window.setTimeout(() => {
          if (applyButton.isConnected) applyButton.textContent = '套用並儲存';
        }, 1600);
      }
      if (saved && row.querySelector('[data-role="list-visible"]').value === '0') panel.hidden = true;
    }
  });
  {
    const modal = document.querySelector('#ragicDesignerModal');
    let draggedListFieldKey = '';
    modal?.addEventListener('dragstart', (event) => {
      const dragHandle = event.target.closest('.designer-list-drag');
      const header = dragHandle?.closest('th[data-list-field-key]');
      if (!header) return;
      draggedListFieldKey = header.dataset.listFieldKey;
      event.dataTransfer.setData('text/plain', draggedListFieldKey);
      header.classList.add('is-dragging');
    });
    modal?.addEventListener('dragover', (event) => {
      const header = event.target.closest('th[data-list-field-key]');
      if (!header || !draggedListFieldKey) return;
      event.preventDefault();
      modal.querySelectorAll('th.is-list-drop-target').forEach((item) => item.classList.remove('is-list-drop-target'));
      header.classList.add('is-list-drop-target');
    });
    modal?.addEventListener('drop', (event) => {
      const header = event.target.closest('th[data-list-field-key]');
      const body = modal.querySelector('.designer-body');
      const sourceRow = designerRowByKey(draggedListFieldKey);
      const targetRow = designerRowByKey(header?.dataset.listFieldKey);
      if (!header || !body || !sourceRow || !targetRow || sourceRow === targetRow) return;
      event.preventDefault();
      body.insertBefore(sourceRow, targetRow);
      updateDesignerPreview();
    });
    modal?.addEventListener('dragend', () => {
      draggedListFieldKey = '';
      modal.querySelectorAll('th.is-dragging, th.is-list-drop-target').forEach((item) => item.classList.remove('is-dragging', 'is-list-drop-target'));
    });
    const beginListColumnResize = (event) => {
      const handle = event.target.closest('[data-list-resize]');
      if (!handle) return;
      if (typeof event.button === 'number' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const fieldKey = handle.dataset.listResize;
      const row = designerRowByKey(fieldKey);
      const header = handle.closest('th');
      if (!row || !header) return;
      const table = header.closest('table');
      const columnIndex = header.cellIndex;
      const column = table?.querySelector(`colgroup col:nth-child(${columnIndex + 1})`);
      const startX = event.clientX;
      const startWidth = header.getBoundingClientRect().width;
      const startTableWidth = table?.getBoundingClientRect().width || 0;
      let currentWidth = Math.round(startWidth);
      const resizeElements = [
        column,
        ...Array.from(table?.rows || []).map((tableRow) => tableRow.cells[columnIndex])
      ].filter(Boolean);
      handle.setPointerCapture?.(event.pointerId);
      document.body.classList.add('is-resizing-list-column');
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        moveEvent.preventDefault();
        currentWidth = Math.max(40, Math.min(2000, Math.round(startWidth + moveEvent.clientX - startX)));
        setDesignerListFieldWidth(fieldKey, currentWidth, false);
        resizeElements.forEach((element) => {
          element.style.width = `${currentWidth}px`;
          element.style.minWidth = `${currentWidth}px`;
          element.style.maxWidth = `${currentWidth}px`;
        });
        if (table) {
          const tableWidth = Math.max(44 + currentWidth, startTableWidth + currentWidth - startWidth);
          table.style.setProperty('width', `${tableWidth}px`, 'important');
          table.style.setProperty('min-width', `${tableWidth}px`, 'important');
        }
      };
      const finish = (finishEvent) => {
        if (finishEvent.pointerId !== event.pointerId) return;
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        document.body.classList.remove('is-resizing-list-column');
        handle.releasePointerCapture?.(event.pointerId);
        setDesignerListFieldWidth(fieldKey, currentWidth);
        openListFieldSettings(fieldKey);
      };
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
    };
    modal?.addEventListener('pointerdown', beginListColumnResize);
  }
  attachLayoutDesignerEvents(document.querySelector('#layoutDesignerPanel'));
  

const addDesignerPairFields = (pairType) => {
  const body = document.querySelector('#ragicDesignerModal .designer-body');
  if (!body) return;
  const definitions = pairType === 'reminderPair'
    ? [
        { key: 'reminderEnabled', label: '啟用提醒', type: 'reminderEnabled' },
        { key: 'reminderTime', label: '提醒時間', type: 'reminderTime' }
      ]
    : [
        { key: 'reportEnabled', label: '提報', type: 'reportEnabled' },
        { key: 'reportLink', label: '提報連結', type: 'reportLink' }
      ];
  const existing = new Set(readDesigner(body).map((field) => field.key));
  definitions.forEach((definition) => {
    if (!existing.has(definition.key)) body.appendChild(fieldDesigner(definition));
  });
  const fields = readDesigner(body);
  const layout = normalizeDesignerFormLayout(RAGIC_STATE.schema?.formLayout, fields);
  const columns = Math.max(2, layout.columns || 5);
  let target = null;
  for (let row = 1; row <= Math.max(layout.rows, 2) && !target; row += 1) {
    for (let col = 1; col < columns && !target; col += 1) {
      const cells = [
        { row, col, colSpan: 1, rowSpan: 1 },
        { row, col: col + 1, colSpan: 1, rowSpan: 1 },
        { row: row + 1, col, colSpan: 1, rowSpan: 1 },
        { row: row + 1, col: col + 1, colSpan: 1, rowSpan: 1 }
      ];
      if (cells.every((cell, index) => isLayoutAreaFree(layout, definitions[index % 2].key, cell))) target = { row, col };
    }
  }
  if (!target) {
    target = { row: (layout.rows || 4) + 1, col: 1 };
    layout.rows = Math.min(10, target.row + 1);
  }
  layout.fields[definitions[0].key] = { row: target.row, col: target.col, colSpan: 1, rowSpan: 1 };
  layout.fields[definitions[1].key] = { row: target.row + 1, col: target.col, colSpan: 1, rowSpan: 1 };
  if (pairType === 'reportPair') {
    layout.fields.reportEnabled = { row: target.row, col: Math.min(columns, target.col + 1), colSpan: 1, rowSpan: 1 };
    layout.fields.reportLink = { row: target.row + 1, col: Math.min(columns, target.col + 1), colSpan: 1, rowSpan: 1 };
  }
  RAGIC_STATE.schema = { ...(RAGIC_STATE.schema || {}), fields: normalizeFields(fields), formLayout: normalizeDesignerFormLayout(layout, fields) };
  updateDesignerPreview();
  renderLayoutDesigner();
};

  document.querySelector('#layoutDesignerPanel')
    ?.addEventListener('click', (event) => {
      const addPopover = document.querySelector('#layoutDesignerPanel .layout-add-popover');
      if (event.target.closest('[data-toggle-layout-add]')) {
        if (addPopover) addPopover.hidden = !addPopover.hidden;
        return;
      }
      if (event.target.closest('[data-close-layout-add]')) {
        if (addPopover) addPopover.hidden = true;
        return;
      }
      
      const pairButton = event.target.closest('[data-add-layout-pair]');
      if (pairButton) {
        addDesignerPairFields(pairButton.dataset.pairType);
        return;
      }
      const addButton = event.target.closest('[data-add-layout-field], .btn-add-layout-field');
    if (addButton) { const body = document.querySelector('.designer-body'); const type = addButton.dataset.fieldType || 'text'; const typeLabel = FIELD_TYPES.find((item) => item.value === type)?.label || LEGACY_FIELD_TYPES.find((item) => item.value === type)?.label || '新欄位'; body.appendChild(fieldDesigner({ key: generateFieldKey(), label: typeLabel, type })); updateDesignerPreview(); renderLayoutDesigner(); return; }
    if (event.target.closest('.btn-auto-layout')) { if (!confirm('這會清除目前的排版，確定嗎？')) return; updateLayoutDesignerState(autoLayoutFields); return; }
    const settings = event.target.closest('.settings-btn, .layout-field');
    if (settings && !event.target.closest('.remove-btn, [data-resize]')) openLayoutFieldSettings(settings.closest('[data-field-key]')?.dataset.fieldKey);
  });
  document.querySelector('#ragicDesignerModal')?.addEventListener('click', async (event) => {
    const panel = event.target.closest('#layoutFieldSettingsPanel');
    if (!panel) return;
    if (event.target.closest('[data-close-layout-settings]')) {
      panel.hidden = true;
      return;
    }
    if (event.target.matches('[data-setting-type]')) panel.querySelector('.setting-options').hidden = !['select','multiselect'].includes(event.target.value);
    if (event.target.closest('[data-add-setting-subfield]')) { const list = panel.querySelector('[data-setting-subfields]'); list?.appendChild(fieldDesigner({ key: generateFieldKey(), label: '新子欄位', type: 'text' }, true)); syncSubtableWidthFromEvent(list); return; }
    if (event.target.closest('[data-remove-settings-field]')) { const key = panel.dataset.fieldKey; if (!confirm('確定刪除此欄位？')) return; removeDesignerFieldByKey(key); updateLayoutDesignerState((layout) => { delete layout.fields[key]; }); panel.hidden = true; return; }
    if (event.target.closest('[data-confirm-settings]')) {
  const key = panel.dataset.fieldKey;

  updateDesignerFieldByKey(key, (row) => {
    row.querySelector('[data-role="label"]').value =
      panel.querySelector('[data-setting-label]').value;

    row.querySelector('[data-role="type"]').value =
      panel.querySelector('[data-setting-type]').value;

    row.querySelector('[data-role="options"]').value =
      String(panel.querySelector('[data-option-list]')?.value || '')
        .split(/\n+/)
        .map((option) => option.trim())
        .filter(Boolean)
        .join('\n');

    row.querySelector('[data-role="required"]').checked =
      panel.querySelector('[data-setting-required]')?.checked ||
      panel.querySelector('[data-setting-required]')?.value === '1' ||
      false;

    // 列表欄寬與表單排版寬度分開儲存。
    row.querySelector('[data-role="width"]').value =
      panel.querySelector('[data-setting-list-width]')?.value || '';

    row.querySelector('[data-role="default"]').value =
      panel.querySelector('[data-setting-default]')?.value || '';

    row.querySelector('[data-role="help"]').value =
      panel.querySelector('[data-setting-help]')?.value || '';

    row.querySelector('[data-role="readonly"]').value =
      panel.querySelector('[data-setting-readonly]')?.checked ||
      panel.querySelector('[data-setting-readonly]')?.value === '1'
        ? '1'
        : '';

    row.querySelector('[data-role="hidden"]').value =
      panel.querySelector('[data-setting-hidden]')?.checked ||
      panel.querySelector('[data-setting-hidden]')?.value === '1'
        ? '1'
        : '';

    row.querySelector('[data-role="list-visible"]').value =
      panel.querySelector('[data-setting-list-visible]')?.checked ? '1' : '0';

    row.dataset.linkedHandover =
      panel.querySelector('[data-setting-linked-handover]')?.checked
        ? '1'
        : '';

    const settingSubfields =
      panel.querySelector('[data-setting-subfields]');

    if (settingSubfields) {
      const targetSubfields =
        row.querySelector('.designer-subfield-list');

      targetSubfields.innerHTML = '';

      readDesigner(settingSubfields).forEach((child) => {
        targetSubfields.appendChild(fieldDesigner(child, true));
      });

      const columnsPerRow =
        panel.querySelector('[data-setting-columns-per-row]')?.value || '';

      const targetColumns =
        row.querySelector('[data-role="columns-per-row"]');

      if (targetColumns) targetColumns.value = columnsPerRow;
    }
  });

  updateLayoutDesignerState((layout) => {
    const candidate = clampLayoutItem(
      {
        row: panel.querySelector('[data-layout-row]')?.value,
        col: panel.querySelector('[data-layout-col]')?.value,
        rowSpan: panel.querySelector('[data-layout-rowspan]')?.value,
        colSpan: panel.querySelector('[data-layout-colspan]')?.value,
        width: panel.querySelector('[data-layout-width]')?.value,
        height: panel.querySelector('[data-layout-height]')?.value
      },
      layout
    );

    if (isLayoutAreaFree(layout, key, candidate)) {
      layout.fields[key] = candidate;
    }
  });

  try {
    const saved = await saveDesignerSchema();

    if (saved) {
      panel.hidden = true;
      alert('欄位屬性與表單排版已儲存');
    }
  } catch (error) {
    console.error('儲存欄位屬性失敗：', error);
    alert(`儲存失敗：${error?.message || '未知錯誤'}`);
  }

  return;
}
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
  document.addEventListener('click', (event) => {
    if (!hasUnsavedRagicChanges()) return;
    const link = event.target.closest('a[href]');
    const leavesCurrentEdit = Boolean(
      (link && link.target !== '_blank') ||
      event.target.closest('#backToListButton, #ragicCancelEdit, #ragicCloseForm, #newRecordButton, #ragicPrevRecord, #ragicNextRecord, #logoutButton')
    );
    if (!leavesCurrentEdit) return;
    if (!confirmDiscardRagicChanges()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    clearRagicDirtyState();
  }, true);
  window.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedRagicChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  applyRagicPermissionUi(); setRagicViewMode('list'); window.addEventListener('resize', setRagicFormOverlayOffset); document.querySelector('#newRecordButton').addEventListener('click', () => { if (canUse('edit')) renderForm({}, { mode: 'edit' }); }); document.querySelector('#backToListButton').addEventListener('click', () => { setRagicViewMode('list'); RAGIC_STATE.formMode = 'view'; });
  document.querySelector('#ragicFormView')?.addEventListener('click', (event) => {
    const editButton = event.target.closest('#ragicEditRecord');
    const cancelEdit = event.target.closest('#ragicCancelEdit');
    const closeForm = event.target.closest('#ragicCloseForm');
    const prevRecord = event.target.closest('#ragicPrevRecord');
    const nextRecord = event.target.closest('#ragicNextRecord');
    if (editButton) { event.preventDefault(); const record = currentRecord(); if (record && canUse('edit')) renderForm(record, { mode: 'edit' }); }
    if (cancelEdit) { event.preventDefault(); const record = currentRecord(); if (record) renderForm(record, { mode: 'view' }); else document.querySelector('#backToListButton')?.click(); }
    if (closeForm) { event.preventDefault(); document.querySelector('#backToListButton')?.click(); }
    if (prevRecord) { event.preventDefault(); openRecordAtIndex(currentFilteredIndex() - 1); }
    if (nextRecord) { event.preventDefault(); openRecordAtIndex(currentFilteredIndex() + 1); }
    const viewImage = event.target.closest('.ragic-view-image, .ragic-view-field .field-value img, .form-view-mode .field-value img');
    if (viewImage && event.currentTarget.contains(viewImage)) {
      event.preventDefault();
      const gallery = viewImage.closest('.ragic-view-images');
      const images = gallery ? [...gallery.querySelectorAll('.ragic-view-image')] : [viewImage];
      const sources = images.map((image) => image.currentSrc || image.src).filter(Boolean);
      openImagePreview(viewImage.currentSrc || viewImage.src, viewImage.alt || '圖片', sources, Math.max(0, images.indexOf(viewImage)));
    }
  });
  document.querySelector('#deleteButton').addEventListener('click', async () => {
    if (!canUse('delete')) return showRagicNotice('您沒有刪除權限', { tone: 'error' });
    if (!RAGIC_STATE.currentId) return;
    const accepted = await confirmRagicAction({
      title: '確定刪除此筆資料？',
      message: '刪除後資料將不再存在，且無法復原。',
      confirmText: '永久刪除',
      danger: true
    });
    if (!accepted) return;
    const deletingId = RAGIC_STATE.currentId;
    try {
      await collection.doc(deletingId).delete();
      document.querySelector('#backToListButton').click();
      showRagicNotice('資料已刪除');
    } catch (error) {
      console.error(error);
      showRagicNotice(error.message || '刪除失敗，請稍後再試。', { tone: 'error', duration: 4500 });
    }
  });
  const ragicForm = document.querySelector('#ragicForm');
  if (isLogNewModule()) ragicForm.noValidate = true;
  ragicForm.addEventListener('submit', async (event) => {
  event.preventDefault();
    const fields = getFields();
    if (!fields.length) {
      alert('表格結構尚未載入，請稍後再試');
      return;
    }
    if (!canUse('edit')) return alert('您沒有編輯權限');
    if (isLogNewModule()) {
      if (!validateLogNewRequiredFields()) return;
    } else if (!validateCompletedStatusRules() || !validateLogCompletionRules()) return;
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
        await docRef.set({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); 
      }
      clearRagicDirtyState();
      // 新增完成後立刻同步目前資料 ID 與刪除按鈕，不必等待快照或重新整理。
      RAGIC_STATE.currentId = savedId;
      applyRagicPermissionUi();
      await syncLinkedHandoverFields({ data, logId: savedId });                   
      const savedRecord = { ...existingRecord, ...data, id: savedId };
      if (isLogModule() && window.pendingLinkedReportAfterSave) {
        window.pendingLinkedReportAfterSave = false;
        renderForm(savedRecord, { mode: 'edit' });
        window.setTimeout(() => window.linkedReportManager?.openModal(savedRecord), 0);
        return;
      }
      const sourceLog = linkedLogUrl(savedRecord);
      const becameCompleted = String(data.status || '').trim() === '已完成' && String(existingRecord.status || '').trim() !== '已完成';
      if (sourceLog && becameCompleted && await askLinkedLogRedirect()) {
        window.location.href = sourceLog;
        return;
      }
      document.querySelector('#backToListButton').click();
    } catch (error) {
      console.error(error);
      showRagicNotice(error.message || '儲存失敗，請稍後再試。', { tone: 'error', duration: 4500 });
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
  if (!collection || !schemaDoc) {
    RAGIC_STATE.schema = makeDefaultSchema(config);
    renderHeader();
    if (newRecordButton) { newRecordButton.dataset.schemaReady = 'true'; newRecordButton.textContent = '+ 新增'; }
    applyRagicPermissionUi();
    return;
  }
  schemaDoc.onSnapshot(async (doc) => {
  if (!doc.exists) {
    const defaultSchema = makeDefaultSchema(config);

    await schemaDoc.set(defaultSchema, { merge: true });

    RAGIC_STATE.schema = normalizeSchema(defaultSchema);
  } else {
    /*
     * Firebase 已儲存的設計為主要來源。
     * 不再用 config.fields 或 config.formLayout 覆蓋使用者設定。
     */
    const loadedSchema = doc.data();

    if (fixDuplicateKeys(loadedSchema.fields || [])) {
      await schemaDoc.set(
        {
          ...loadedSchema,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    RAGIC_STATE.schema = normalizeSchema(mergeLogConfigFields(loadedSchema, config));
  }

    renderHeader();
  if (newRecordButton) { newRecordButton.dataset.schemaReady = 'true'; newRecordButton.textContent = '+ 新增'; }
  applyRagicPermissionUi();
  applyFilters();
});

collection
  .orderBy('createdAt', 'desc')
  .onSnapshot((snapshot) => {
    RAGIC_STATE.records = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    applyRagicPermissionUi();
    applyFilters();
  });
};
