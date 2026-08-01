const dashboardDb = window.omniplayDb;
const dashboardCollections = {
  staff: dashboardDb?.collection('staff'),
  leave: dashboardDb?.collection('leave'),
  handover: dashboardDb?.collection('handover'),
  tracking: dashboardDb?.collection('tracking'),
  report: dashboardDb?.collection('report'),
  log: dashboardDb?.collection('log'),
  schedule: dashboardDb?.collection('schedule'),
  meeting: dashboardDb?.collection('meeting'),
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
  schedules: [],
  meetings: [],
  selectedShift: getDefaultShift(),
  selectedTodoType: 'all'
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

const isInShiftRange = (record = {}, range) => {
  const updatedAt = valueDate(record.updatedAt) || valueDate(record.updatedDate);
  return Boolean(updatedAt && updatedAt >= range.start && updatedAt <= range.end);
};


const getRepeatStepDays = (item) => {
  if (item.repeat === 'daily') return 1;
  if (item.repeat === 'weekly') return 7;
  if (item.repeat === 'custom') return Math.max(1, Number(item.repeatInterval) || 1);
  return 0;
};

const daysBetween = (start, end) => Math.floor((new Date(end.getFullYear(), end.getMonth(), end.getDate()) - new Date(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);

const addMonthsClamped = (date, count) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + count);
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
};

const scheduleDateFromParts = (dateValue, timeValue = '00:00') => {
  const dateText = String(dateValue || '').trim().replace(/\//g, '-');
  const match = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const [hour = 0, minute = 0] = String(timeValue || '00:00').split(':').map(Number);
  const parsed = new Date(year, month - 1, day, hour || 0, minute || 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const scheduleOriginalDate = (item = {}) => valueDate(item.reminderAt) || valueDate(item.datetime) || valueDate(item.startAt) || scheduleDateFromParts(item.date, item.time || item.startTime);

const scheduleOccurrencesForDay = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const items = [];
  const addOccurrence = (item, occurrenceAt, isRepeat) => {
    items.push({ ...item, occurrenceAt, isRepeatOccurrence: isRepeat });
  };

  dashboardState.schedules.filter((item) => item.deleted !== true).forEach((item) => {
    const original = scheduleOriginalDate(item);
    if (!(original instanceof Date) || Number.isNaN(original.getTime())) return;
    if (original >= start && original <= end) addOccurrence(item, original, false);

    if ((item.repeat || 'none') === 'monthly') {
      for (let i = 1, occurrence = addMonthsClamped(original, i); occurrence <= end; i += 1, occurrence = addMonthsClamped(original, i)) {
        if (occurrence >= start) addOccurrence(item, occurrence, true);
      }
      return;
    }

    const step = getRepeatStepDays(item);
    if (!step) return;
    const firstOffset = Math.max(step, Math.ceil(Math.max(1, daysBetween(original, start)) / step) * step);
    for (let offset = firstOffset; ; offset += step) {
      const occurrence = new Date(original);
      occurrence.setDate(original.getDate() + offset);
      if (occurrence > end) break;
      if (occurrence >= start) addOccurrence(item, occurrence, true);
    }
  });
  
  return items.sort((a, b) => a.occurrenceAt - b.occurrenceAt || String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant'));
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
  const reportTrackStatuses = new Set(['待辦中', '處理中', '觀察中', '追客']);
  const normalizeReportStatus = (value) => String(value || '').trim().replace(/["']/g, '');
  const fireHandovers = dashboardState.handovers.filter((record) => record.fire === true);
  const range = getShiftRange(dashboardState.selectedShift);
  const logs = dashboardState.logs.filter((record) => isInShiftRange(record, range));
  setText('#handoverFireCount', fireHandovers.length);
  setText('#trackingOpenCount', dashboardState.reports.filter((record) => reportTrackStatuses.has(normalizeReportStatus(record.status))).length);
  setText('#shiftLogCount', logs.length);
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

const todoTitle = (record = {}, fallback) => record.subject || record.title || record.item || record.category || record.content || record.note || record.serial || fallback;
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
const trackingActivityKind = (record = {}) => {
  const createdAt = valueDate(record.createdAt) || valueDate(trackingDirectValue(record, '建立日期'));
  const updatedAt = valueDate(record.updatedAt) || valueDate(trackingDirectValue(record, '更新日期'));
  if (createdAt && updatedAt && Math.abs(updatedAt.getTime() - createdAt.getTime()) <= 60000) return '建立';
  return '更新';
};
const recordDateForShift = (record = {}, range) => {
  const updatedAt = valueDate(record.updatedAt) || valueDate(record.updatedDate);
  if (updatedAt && updatedAt >= range.start && updatedAt <= range.end) return updatedAt;
  return updatedAt;
};
const formatRecordTime = (at) => at ? `${pad2(at.getHours())}:${pad2(at.getMinutes())}` : '--:--';
const isFireRecord = (record = {}) => record.fire === true;
const withRecordLink = (href, id) => id ? `${href}?id=${encodeURIComponent(id)}` : href;
const shiftRecordItems = (records, { type, icon, href, fallback, detailsFormatter, activityFormatter }) => {
  const range = getShiftRange(dashboardState.selectedShift);
  return records
    .filter(() => true)
    .map((record) => {
      const at = recordDateForShift(record, range);
      return {
        icon: isFireRecord(record) ? '🔥' : icon,
        time: isFireRecord(record) ? '--:--' : formatRecordTime(at),
        type,
        href: withRecordLink(href, record.id),
        title: todoTitle(record, fallback),
        details: detailsFormatter ? detailsFormatter(record) : null,
        activityKind: activityFormatter ? activityFormatter(record) : '',
        sortAt: isFireRecord(record) ? 0 : (at || new Date(8640000000000000)).getTime()
      };
    });
};
const scheduleItems = () => scheduleOccurrencesForDay().map((item) => {
  const allDay = item.allDay || item.isAllDay;
  return {
    icon: '📅',
    time: allDay ? '全天' : `${pad2(item.occurrenceAt.getHours())}:${pad2(item.occurrenceAt.getMinutes())}`,
    type: '排程',
    href: withRecordLink('service/schedule.html', item.id),
    title: item.title || '未命名事項',
    sortAt: item.occurrenceAt.getTime()
  };
});
const todoTypeLabel = (type) => {
  if (type === '日誌') return '日誌 NEW';
  return type;
};

const renderTodoFilters = (items) => {
  const container = document.querySelector('#dashboardTodoFilters');
  if (!container) return;

  const counts = items.reduce((result, item) => {
    result[item.type] = (result[item.type] || 0) + 1;
    return result;
  }, {});

  const types = ['日誌', '交接', '提報', '對接追蹤', '會議', '排程']
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
        ${escapeDashboardHtml(todoTypeLabel(type))} (${counts[type]})
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

const renderTodoList = () => {
  if (!todoList) return;

  const items = [
    ...shiftRecordItems(dashboardState.handovers, {
      type: '交接',
      icon: '📋',
      href: 'work/handover.html',
      fallback: '交接事項'
    }),
    ...shiftRecordItems(dashboardState.logs, {
      type: '日誌',
      icon: '📝',
      href: 'work/log.html',
      fallback: '日誌'
    }),
    ...shiftRecordItems(dashboardState.reports, {
      type: '提報',
      icon: '📌',
      href: 'work/report.html',
      fallback: '提報追蹤'
    }),
    ...shiftRecordItems(dashboardState.tracking, {
      type: '對接追蹤',
      icon: '🔎',
      href: 'work/tracking.html',
      fallback: '對接追蹤',
      detailsFormatter: trackingTodoDetails,
      activityFormatter: trackingActivityKind
    }),
    ...shiftRecordItems(dashboardState.meetings, {
      type: '會議',
      icon: '💬',
      href: 'meeting/meeting.html',
      fallback: '會議紀錄'
    }),
    ...scheduleItems()
  ].sort((a, b) =>
    a.sortAt - b.sortAt ||
    String(a.type).localeCompare(String(b.type), 'zh-Hant') ||
    String(a.title).localeCompare(String(b.title), 'zh-Hant')
  );

  renderTodoFilters(items);

  const filteredItems = dashboardState.selectedTodoType === 'all'
    ? items
    : items.filter((item) => item.type === dashboardState.selectedTodoType);

  const renderTrackingDetails = (item) => {
    const details = item.details;

    if (!details) {
      return `<strong>${escapeDashboardHtml(todoTypeLabel(item.type))} — ${escapeDashboardHtml(item.title)}</strong>`;
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
            ${item.activityKind
              ? `
                <span class="todo-activity-kind todo-activity-${item.activityKind === '建立' ? 'created' : 'updated'}">
                  ${escapeDashboardHtml(item.activityKind)}
                </span>
              `
              : ''
            }
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
  dashboardCollections.log?.onSnapshot((snapshot) => { dashboardState.logs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.schedule?.onSnapshot((snapshot) => { dashboardState.schedules = snapshot.docs.map((doc) => ({ id: doc.id, labelColor: '#3b82f6', ...doc.data() })); updateDashboard(); });
  dashboardCollections.meeting?.onSnapshot((snapshot) => { dashboardState.meetings = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
};

document.querySelectorAll('.shift-btn').forEach((button) => {
  button.addEventListener('click', () => {
    dashboardState.selectedShift = button.dataset.shift || 'morning';
    updateDashboard();
  });
});
subscribeDashboard();
window.getShiftRange = getShiftRange;
window.getDefaultShift = getDefaultShift;
