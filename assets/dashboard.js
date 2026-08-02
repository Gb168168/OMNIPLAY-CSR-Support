const dashboardDb = window.omniplayDb;
const dashboardCollections = {
  staff: dashboardDb?.collection('staff'),
  leave: dashboardDb?.collection('leave'),
  handover: dashboardDb?.collection('handover'),
  tracking: dashboardDb?.collection('tracking'),
  report: dashboardDb?.collection('report'),
  log: dashboardDb?.collection('log_new'),
  prod: dashboardDb?.collection('alert'),
  knowledge: dashboardDb?.collection('knowledge'),
  ai: dashboardDb?.collection('ai_database'),
  trackingSchema: dashboardDb?.collection('tracking_schema')?.doc('active')
};

const dashboardState = {
  staff: [],
  leave: {},
  handovers: [],
  tracking: [],
  trackingSchema: null,
  reports: [],
  logs: [],
  inbox: [],
  prod: [],
  knowledge: [],
  ai: [],
  selectedShift: getDefaultShift(),
  selectedTodoType: 'all',
  selectedTodoEvent: 'all'
};
const todoList = document.querySelector('#dashboardTodoList');
const setText = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = String(value); };
const pad2 = (value) => String(value).padStart(2, '0');
const monthKey = (date = new Date()) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
const dayKey = (date = new Date()) => pad2(date.getDate());
const displayDate = (date = new Date()) => `${date.getMonth() + 1}/${date.getDate()}`;
const isActiveStaff = (staff = {}) => !['停用', '離職', 'inactive', 'disabled'].includes(String(staff.status || staff.state || '').trim().toLowerCase());
const isSystemStaff = (staff = {}) => [staff.account, staff.code, staff.name].some((value) => String(value || '').toUpperCase() === 'OMNIPLAY');
const valueDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const normalized = String(value).replace(/\//g, '-').replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
function getShiftRange(shift) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (shift === 'morning') {
    return {
      start: new Date(today.getTime() + 8 * 60 * 60 * 1000),
      end: new Date(today.getTime() + 20 * 60 * 60 * 1000)
    };
  }
  
  const nightBase = new Date(today);
  if (now.getHours() < 8) nightBase.setDate(nightBase.getDate() - 1);
  return {
    start: new Date(nightBase.getTime() + 20 * 60 * 60 * 1000),
    end: new Date(nightBase.getTime() + 32 * 60 * 60 * 1000)
  };
}

function getDefaultShift() {
  const hour = new Date().getHours();
  if (hour >= 8 && hour < 20) return 'morning';
  return 'night';
}

const isSameDate = (dateA, dateB = new Date()) => Boolean(
  dateA &&
  dateA.getFullYear() === dateB.getFullYear() &&
  dateA.getMonth() === dateB.getMonth() &&
  dateA.getDate() === dateB.getDate()
);

const recordCreatedAt = (record = {}) =>
  valueDate(record.createdAt) ||
  valueDate(record.createdDate) ||
  valueDate(record.created_at);

const recordUpdatedAt = (record = {}) =>
  valueDate(record.updatedAt) ||
  valueDate(record.updatedDate) ||
  valueDate(record.updated_at) ||
  valueDate(record.updated_time);

const inboxCreatedAt = (record = {}) => valueDate(record.createdAt) || valueDate(record.created_at);
const inboxUpdatedAt = (record = {}) =>
  valueDate(record.updatedAt) ||
  valueDate(record.updated_at) ||
  valueDate(record.analyzedAt) ||
  valueDate(record.analysis?.analyzedAt) ||
  valueDate(record.importedAt) ||
  valueDate(record.archivedAt);

const recordReminderAt = (record = {}) =>
  valueDate(record.reminder_at) ||
  valueDate(record.reminderAt);

const reminderIsEnabled = (record = {}) =>
  record.reminder_enabled === true ||
  record.reminderEnabled === true;

const recordBelongsToSelectedShift = (record = {}) => {
  const shift = String(record.shift || '').trim();
  if (!shift) return true;

  if (dashboardState.selectedShift === 'morning') {
    return ['早', '早班', 'morning'].includes(shift.toLowerCase());
  }

  return ['晚', '晚班', 'night'].includes(shift.toLowerCase());
};

const getTodayActivity = (record = {}, { createdAt = recordCreatedAt, updatedAt = recordUpdatedAt } = {}) => {
  const today = new Date();
  const createdDate = createdAt(record);
  const updatedDate = updatedAt(record);

  const createdToday = isSameDate(createdDate, today) && recordBelongsToSelectedShift(record);
  const updatedToday = isSameDate(updatedDate, today);
  if (!createdToday && !updatedToday) return null;
  return {
    createdToday,
    updatedToday,
    createdAt: createdToday ? createdDate : null,
    updatedAt: updatedToday ? updatedDate : null,
    at: [createdToday ? createdDate : null, updatedToday ? updatedDate : null]
      .filter(Boolean)
      .sort((a, b) => b - a)[0]
  };
};

const normalizeDashboardShift = (value) => {
  const text = String(value || '').trim();
  if (['晚', '晚班', 'night', 'pm'].includes(text.toLowerCase())) return '晚';
  return '早';
};

const updateTodayWorking = () => {
  const today = new Date();
  const todayKey = dayKey(today);
  const records = dashboardState.leave.records || {};
  const groups = { '早': [], '晚': [] };

  dashboardState.staff
    .filter((staff) => isActiveStaff(staff) && !isSystemStaff(staff))
    .forEach((staff) => {
      const record = records[`${staff.id}_${todayKey}`] || {};
      if (['leave', 'required'].includes(record.type)) return;

      const specials = Array.isArray(record.specials) ? record.specials : [];
      const name = `${staff.name || staff.code || staff.account || '未命名'}${specials.includes('phone') ? '📱' : ''}`;
      groups[normalizeDashboardShift(staff.shift)].push(name);
    });

  setText('#todayWorkingTitle', `今日上班（${displayDate(today)}）`);

  const list = document.querySelector('#todayWorkingList');
  if (!list) return;
  const rows = Object.entries(groups)
    .filter(([, names]) => names.length > 0)
    .map(([shift, names]) => `<div class="today-working-row"><span>${shift} - </span>${escapeDashboardHtml(names.join('、'))}</div>`);
  list.innerHTML = rows.length ? rows.join('') : '<div class="today-working-empty">今日無人上班</div>';
};

const updateDashboard = () => {
  const fireHandovers = dashboardState.handovers.filter((record) => record.fire === true);
  const items = buildDashboardItems();
  setText('#handoverFireCount', fireHandovers.length);
  setText('#todayCreatedCount', items.filter((item) => item.isCreated).length);
  setText('#todayUpdatedCount', items.filter((item) => item.isUpdated).length);
  setText('#todayReminderCount', buildReminderItems(items).length);
  updateTodayWorking();
  updateShiftButtons();
  renderTodoList();
};

const updateShiftButtons = () => {
  document.querySelectorAll('.shift-btn').forEach((button) => {
    const active = button.dataset.shift === dashboardState.selectedShift;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
};

const todoTitle = (record = {}, fallback) => {
  if (record.serial) return record.serial;
  if (record.displayId) return record.displayId;

  return (
    record.subject ||
    record.title ||
    record.item ||
    record.customer ||
    record.content ||
    record.note ||
    fallback
  );
};
const dashboardValueText = (value) => Array.isArray(value)
  ? value.map(dashboardValueText).filter(Boolean).join('、')
  : String(value ?? '').trim();
const trackingFieldByLabel = (label = '') => {
  const fields = dashboardState.trackingSchema?.fields || [];
  const direct = fields.find((field) => String(field.label || '').trim() === label);
  if (direct && direct.type !== 'subtable') return { field: direct, parent: null };
  const parent = fields.find((field) =>
    field.type === 'subtable' &&
    (field.fields || []).some((subfield) => String(subfield.label || '').trim() === label)
  );
  const field = (parent?.fields || []).find((subfield) => String(subfield.label || '').trim() === label);
  return field ? { field, parent } : { field: null, parent: null };
};
const trackingDirectValue = (record = {}, label = '') => {
  const definition = trackingFieldByLabel(label);
  return !definition.parent && definition.field ? dashboardValueText(record[definition.field.key]) : '';
};
const trackingTodoDetails = (record = {}) => {
  const customer = trackingDirectValue(record, '客戶域名') || '—';
  const appDefinition = trackingFieldByLabel('APP');
  const groupDefinition = trackingFieldByLabel('群組名稱');
  const walletDefinition = trackingFieldByLabel('錢包類型');
  const parent = appDefinition.parent || groupDefinition.parent || walletDefinition.parent;
  const sourceRows = parent && Array.isArray(record[parent.key]) && record[parent.key].length
    ? record[parent.key]
    : [{}];
  const directWallet = !walletDefinition.parent && walletDefinition.field
    ? dashboardValueText(record[walletDefinition.field.key])
    : '';
  const rows = sourceRows.map((row) => ({
    app: appDefinition.parent ? dashboardValueText(row?.[appDefinition.field?.key]) : trackingDirectValue(record, 'APP'),
    group: groupDefinition.parent ? dashboardValueText(row?.[groupDefinition.field?.key]) : trackingDirectValue(record, '群組名稱'),
    wallet: walletDefinition.parent ? dashboardValueText(row?.[walletDefinition.field?.key]) : directWallet
  })).map((row) => ({
    app: row.app || '—',
    group: row.group || '—',
    wallet: row.wallet || '—'
  }));
  return { customer, rows };
};
const formatRecordTime = (at) => at ? `${pad2(at.getHours())}:${pad2(at.getMinutes())}` : '--:--';
const isFireRecord = (record = {}) => record.fire === true;
const withRecordLink = (href, id) => id ? `${href}?id=${encodeURIComponent(id)}` : href;
const buildRecordItems = (
  records,
  { type, icon, href, fallback, detailsFormatter, createdAt, updatedAt }
) => {
  return records
    .map((record) => {
      const activity = getTodayActivity(record, { createdAt, updatedAt });
      const reminderAt = recordReminderAt(record);
      const hasReminderToday = reminderIsEnabled(record) && isSameDate(reminderAt);
      if (!activity && !hasReminderToday) return null;

      const eventAt = activity?.at || reminderAt;
      return {
        icon: isFireRecord(record) ? '🔥' : icon,
        time: formatRecordTime(eventAt),
        type,
        href: withRecordLink(href, record.id),
        title: todoTitle(record, fallback),
        details: detailsFormatter ? detailsFormatter(record) : null,
        isCreated: activity?.createdToday === true,
        isUpdated: activity?.updatedToday === true,
        reminderEnabled: hasReminderToday,
        reminderTime: hasReminderToday ? reminderAt : null,
        sortAt: Math.max(activity?.at?.getTime() || 0, hasReminderToday ? reminderAt?.getTime() || 0 : 0)
      };
    })
    .filter(Boolean);
};

const buildLogNewItems = () => buildRecordItems(dashboardState.logs, { type: '日誌 NEW', icon: '✨', href: 'work/log-new.html', fallback: '日誌 NEW' });
const buildInboxItems = () => buildRecordItems(dashboardState.inbox, { type: '收件匣', icon: '📥', href: 'work/inbox.html', fallback: 'Conversation', createdAt: inboxCreatedAt, updatedAt: inboxUpdatedAt });
const buildHandoverItems = () => buildRecordItems(dashboardState.handovers, { type: '交接', icon: '🤝', href: 'work/handover.html', fallback: '交接事項' });
const buildReportItems = () => buildRecordItems(dashboardState.reports, { type: '提報', icon: '📣', href: 'work/report.html', fallback: '提報追蹤' });
const buildTrackingItems = () => buildRecordItems(dashboardState.tracking, { type: '對接追蹤', icon: '🔎', href: 'work/tracking.html', fallback: '對接追蹤', detailsFormatter: trackingTodoDetails });
const buildProdItems = () => buildRecordItems(dashboardState.prod, { type: 'PROD告警紀錄', icon: '🚨', href: 'work/alert.html', fallback: 'PROD 告警' });
const buildKnowledgeItems = () => buildRecordItems(dashboardState.knowledge, { type: '知識庫', icon: '📚', href: 'resource/knowledge.html', fallback: '知識庫' });
const buildAiItems = () => buildRecordItems(dashboardState.ai, { type: 'AI資料庫', icon: '🤖', href: 'resource/ai-database.html', fallback: 'AI 資料庫' });
const buildReminderItems = (items) => items.filter((item) => item.reminderEnabled);
const dashboardItemBuilders = [buildLogNewItems, buildInboxItems, buildHandoverItems, buildReportItems, buildTrackingItems, buildProdItems, buildKnowledgeItems, buildAiItems];
const buildDashboardItems = () => dashboardItemBuilders.flatMap((builder) => builder()).sort((a, b) =>
  b.sortAt - a.sortAt ||
  String(a.type).localeCompare(String(b.type), 'zh-Hant') ||
  String(a.title).localeCompare(String(b.title), 'zh-Hant')
);

const renderTodoFilters = (items) => {
  const container = document.querySelector('#dashboardTodoFilters');
  if (!container) return;

  const counts = items.reduce((result, item) => {
    result[item.type] = (result[item.type] || 0) + 1;
    return result;
  }, {});

  const types = ['日誌 NEW', '收件匣', '交接', '提報', '對接追蹤', 'PROD告警紀錄', '知識庫', 'AI資料庫']
    .filter((type) => counts[type] > 0);

  if (!types.length) {
    container.innerHTML = '';
    container.hidden = true;
    dashboardState.selectedTodoType = 'all';
    return;
  }

  container.hidden = false;

  const validTypes = ['all', ...types];
  if (!validTypes.includes(dashboardState.selectedTodoType)) {
    dashboardState.selectedTodoType = 'all';
  }

  const buttons = [];

  if (types.length > 1) {
    buttons.push(`
      <button
        type="button"
        class="todo-filter-btn ${dashboardState.selectedTodoType === 'all' ? 'active' : ''}"
        data-todo-type="all"
      >
        全部 (${items.length})
      </button>
    `);
  } else {
    dashboardState.selectedTodoType = types[0];
  }

  types.forEach((type) => {
    buttons.push(`
      <button
        type="button"
        class="todo-filter-btn ${dashboardState.selectedTodoType === type ? 'active' : ''}"
        data-todo-type="${escapeDashboardHtml(type)}"
      >
        ${escapeDashboardHtml(type)} (${counts[type]})
      </button>
    `);
  });

  container.innerHTML = buttons.join('');

  container.querySelectorAll('.todo-filter-btn').forEach((button) => {
    button.addEventListener('click', () => {
      dashboardState.selectedTodoType = button.dataset.todoType || 'all';
      renderTodoList();
    });
  });
};

const renderTodoEventFilters = (items) => {
  const container = document.querySelector('#todoEventFilter');
  if (!container) return;

  const counts = {
    created: items.filter(item => item.isCreated).length,
    updated: items.filter(item => item.isUpdated).length,
    reminder: buildReminderItems(items).length
  };

  const events = [];

  if (counts.created) events.push({ key: 'created', text: `🆕 建立 (${counts.created})` });
  if (counts.updated) events.push({ key: 'updated', text: `✏️ 更新 (${counts.updated})` });
  if (counts.reminder) events.push({ key: 'reminder', text: `⏰ 提醒 (${counts.reminder})` });

  if (!events.length) {
    container.hidden = true;
    container.innerHTML = '';
    dashboardState.selectedTodoEvent = 'all';
    return;
  }

  container.hidden = false;

  container.innerHTML = `
    <button
      class="todo-filter-btn ${dashboardState.selectedTodoEvent === 'all' ? 'active' : ''}"
      data-event="all">
      全部
    </button>
    ${events.map(event => `
      <button
        class="todo-filter-btn ${dashboardState.selectedTodoEvent === event.key ? 'active' : ''}"
        data-event="${event.key}">
        ${event.text}
      </button>
    `).join('')}
  `;

  container.querySelectorAll('button').forEach(button => {
    button.onclick = () => {
      dashboardState.selectedTodoEvent = button.dataset.event;
      renderTodoList();
    };
  });
};

const renderTodoList = () => {
  if (!todoList) return;

  const items = buildDashboardItems();

  renderTodoFilters(items);
  renderTodoEventFilters(items);
  
  let filteredItems = items;

  // 第一層：模組分類
    if (dashboardState.selectedTodoType !== 'all') {
       filteredItems = filteredItems.filter(
       (item) => item.type === dashboardState.selectedTodoType
    );
  }

  // 第二層：事件分類
    if (dashboardState.selectedTodoEvent === 'created') {
      filteredItems = filteredItems.filter((item) => item.isCreated);
    }

    if (dashboardState.selectedTodoEvent === 'updated') {
      filteredItems = filteredItems.filter((item) => item.isUpdated);
    }

    if (dashboardState.selectedTodoEvent === 'reminder') {
      filteredItems = buildReminderItems(filteredItems);
    }
    const renderTrackingDetails = (item) => {
    const details = item.details;

    if (!details) {
      return `<strong>${escapeDashboardHtml(item.title)}</strong>`;
    }

    const rows = details.rows?.length
      ? details.rows
      : [{ app: '—', group: '—', wallet: '—' }];

    return `
      <strong class="tracking-todo-main">
        <span class="tracking-todo-prefix">
          ${escapeDashboardHtml(item.type)} —
        </span>
        <span class="tracking-todo-data">
          ${rows.map((row) => `
            <span class="tracking-todo-cell tracking-todo-customer">
              ${escapeDashboardHtml(details.customer)}
            </span>
            <span class="tracking-todo-cell">
              ${escapeDashboardHtml(row.app)}
            </span>
            <span class="tracking-todo-cell tracking-todo-group">
              ${escapeDashboardHtml(row.group)}
            </span>
            <span class="tracking-todo-cell">
              ${escapeDashboardHtml(row.wallet)}
            </span>
          `).join('')}
        </span>
      </strong>
    `;
  };

  todoList.innerHTML = filteredItems.length
    ? filteredItems.map((item) => `
        <li>
          <a href="${item.href}">
            <span class="todo-type">
              ${item.icon} ${escapeDashboardHtml(item.time)}
            </span>
            ${renderTrackingDetails(item)}

            <div class="todo-tags">
              ${item.isCreated ? '<span class="todo-tag created">🆕 建立</span>' : ''}
              ${item.isUpdated ? '<span class="todo-tag updated">✏️ 更新</span>' : ''}
              ${item.reminderEnabled
                ? `<span class="todo-tag reminder">
                    ⏰ ${escapeDashboardHtml(formatRecordTime(item.reminderTime))} 提醒
                   </span>`
                : ''
               }
            </div>
          </a>
        </li>
      `).join('')
    : '<li class="dashboard-empty">這個分類目前沒有資料。</li>';
};
const escapeDashboardHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

const subscribeDashboard = () => {
  if (!dashboardDb) return;
  dashboardCollections.staff?.onSnapshot((snapshot) => { dashboardState.staff = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.leave?.doc(monthKey()).onSnapshot((doc) => { dashboardState.leave = doc.exists ? { records: {}, ...doc.data() } : { records: {} }; updateDashboard(); });
  dashboardCollections.handover?.onSnapshot((snapshot) => { dashboardState.handovers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.tracking?.onSnapshot((snapshot) => { dashboardState.tracking = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.trackingSchema?.onSnapshot((doc) => { dashboardState.trackingSchema = doc.exists ? doc.data() : null; updateDashboard(); });
  dashboardCollections.report?.onSnapshot((snapshot) => { dashboardState.reports = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.log?.onSnapshot((snapshot) => {
  dashboardState.logs = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));

  updateDashboard();
});
  dashboardCollections.prod?.onSnapshot((snapshot) => { dashboardState.prod = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.knowledge?.onSnapshot((snapshot) => { dashboardState.knowledge = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.ai?.onSnapshot((snapshot) => { dashboardState.ai = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
};

const loadDashboardInbox = async () => {
  const base = String(localStorage.getItem('omniplayInboxWorkerUrl') || '').replace(/\/$/, '');
  const key = localStorage.getItem('omniplayInboxAccessKey') || '';
  if (!base || !key) return;
  try {
    const response = await fetch(`${base}/api/conversations`, { headers: { authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    dashboardState.inbox = await response.json();
    updateDashboard();
  } catch (error) {
    console.warn('首頁收件匣資料載入失敗', error);
  }
};

document.querySelectorAll('.shift-btn').forEach((button) => {
  button.addEventListener('click', () => {
    dashboardState.selectedShift = button.dataset.shift || 'morning';
    updateDashboard();
  });
});
subscribeDashboard();
loadDashboardInbox();
window.getShiftRange = getShiftRange;
window.getDefaultShift = getDefaultShift;
