const dashboardDb = window.omniplayDb;
const dashboardCollections = {
  staff: dashboardDb?.collection('staff'),
  leave: dashboardDb?.collection('leave'),
  handover: dashboardDb?.collection('handover'),
  tracking: dashboardDb?.collection('tracking'),
  report: dashboardDb?.collection('report'),
  log: dashboardDb?.collection('log_new'),
  schedule: dashboardDb?.collection('schedule'),
  meeting: dashboardDb?.collection('meeting'),
  trackingSchema: dashboardDb?.collection('tracking_schema')?.doc('active')
};

const dashboardState = {
  staff: [],
  leave: {},
  externalLeave: {},
  externalLeaveLoaded: false,
  handovers: [],
  tracking: [],
  trackingSchema: null,
  reports: [],
  logs: [],
  schedules: [],
  meetings: [],
  selectedShift: getDefaultShift(),
  selectedTodoSection: 'all',
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

const getTodayActivity = (record = {}) => {
  const today = new Date();
  const createdAt = recordCreatedAt(record);
  const updatedAt = recordUpdatedAt(record);

  const createdToday = isSameDate(createdAt, today);
  const updatedToday = isSameDate(updatedAt, today);

  if (createdToday && recordBelongsToSelectedShift(record)) {
    return {
      kind: '建立',
      at: createdAt
    };
  }

  if (updatedToday) {
    return {
      kind: '更新',
      at: updatedAt
    };
  }

  return null;
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

const dashboardExcludedWorkingNames = new Set(['rondo', '中魁']);
const dashboardPhonePartners = { '佳臻': '茗雅', '茗雅': '佳臻', '晴心': '澄希', '澄希': '晴心' };
const dashboardFixedPhoneAssignments = { '2026-08': { '佳臻': [4, 6, 12, 17, 29], '茗雅': [5, 13, 16, 18, 22, 23] } };
const dashboardExternalRecord = (name, day) => dashboardState.externalLeave?.[name]?.days?.[String(day)] || {};
const dashboardRecordIsBlank = (record = {}) => !record.type && !record.label && (!Array.isArray(record.specials) || record.specials.length === 0);
const dashboardRecordIsWorking = (record = {}) => {
  if (dashboardRecordIsBlank(record)) return true;
  if (Array.isArray(record.specials) && record.specials.length) return false;
  const match = String(record.label || '').trim().match(/(\d+(?:\.\d+)?)\s*(?:小時|H|HR)?$/i);
  const hours = Number(match?.[1]);
  return Number.isFinite(hours) && hours > 0 && hours < 8;
};
const dashboardSavedLeaveRecord = (staff, day) => dashboardState.leave.records?.[`${staff.id}_${String(day)}`] || {};
const dashboardCanAutoAssignPhone = (name, day) => {
  const partner = dashboardPhonePartners[name];
  return Boolean(partner) && dashboardRecordIsBlank(dashboardExternalRecord(name, day)) && dashboardRecordIsBlank(dashboardExternalRecord(partner, day));
};
const dashboardHasPhoneDuty = (staff, day, date) => {
  const name = String(staff.name || '').trim();
  const override = dashboardSavedLeaveRecord(staff, day).phoneOverride;
  if (typeof override === 'boolean') return override && Boolean(dashboardPhonePartners[name]);
  if (!dashboardCanAutoAssignPhone(name, day)) return false;
  const fixedDays = dashboardFixedPhoneAssignments[monthKey(date)]?.[name];
  if (Array.isArray(fixedDays)) return fixedDays.includes(day);
  if (!['晴心', '澄希'].includes(name)) return false;
  const totalDays = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const eligibleDays = Array.from({ length: totalDays }, (_, index) => index + 1).filter((candidateDay) => dashboardCanAutoAssignPhone('晴心', candidateDay));
  const dutyIndex = eligibleDays.indexOf(day);
  return dutyIndex >= 0 && (dutyIndex % 2 === 0 ? name === '晴心' : name === '澄希');
};
const updateTodayWorking = () => {
  const today = new Date();
  const todayNumber = today.getDate();
  const groups = { '早': [], '晚': [] };
  const list = document.querySelector('#todayWorkingList');
  setText('#todayWorkingTitle', `今日上班（${displayDate(today)}）`);
  if (!list) return;
  if (!dashboardState.externalLeaveLoaded) { list.textContent = '載入中...'; return; }
  dashboardState.staff
    .filter((staff) => isActiveStaff(staff) && !isSystemStaff(staff))
    .filter((staff) => !dashboardExcludedWorkingNames.has(String(staff.name || staff.code || '').trim().toLowerCase()))
    .forEach((staff) => {
      const name = String(staff.name || staff.code || staff.account || '未命名').trim();
      const externalPerson = dashboardState.externalLeave?.[name];
      if (!externalPerson || !dashboardRecordIsWorking(dashboardExternalRecord(name, todayNumber))) return;
      const displayName = `${name}${dashboardHasPhoneDuty(staff, todayNumber, today) ? '📱' : ''}`;
      groups[normalizeDashboardShift(externalPerson.shift || staff.shift)].push(displayName);
    });
  const rows = Object.entries(groups).filter(([, names]) => names.length > 0).map(([shift, names]) => `<div class="today-working-row"><span>${shift} - </span>${escapeDashboardHtml(names.join('、'))}</div>`);
  list.innerHTML = rows.length ? rows.join('') : '<div class="today-working-empty">今日無人上班</div>';
};

const updateDashboard = () => {
  const reportTrackStatuses = new Set(['待辦中', '處理中', '觀察中', '追客']);
  const normalizeReportStatus = (value) => String(value || '').trim().replace(/["']/g, '');
  const fireHandovers = dashboardState.handovers.filter((record) => record.fire === true);
  const logs = dashboardState.logs.filter((record) => Boolean(getTodayActivity(record)));
  setText('#handoverFireCount', fireHandovers.length);
  setText('#trackingOpenCount', dashboardState.reports.filter((record) => reportTrackStatuses.has(normalizeReportStatus(record.status))).length);
  setText('#shiftLogCount', logs.length);
  updateTodayWorking();
  updateShiftButtons();
  renderTodoList();
};

const loadDashboardExternalLeave = async () => {
const targetMonth = monthKey();
try {
  const response = await fetch(`https://omniplay-leave-sync.omniplaycsr168168.workers.dev/?month=${encodeURIComponent(targetMonth)}&t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.month !== targetMonth) return;
  dashboardState.externalLeave = payload.people || {};
} catch (error) {
  console.warn('首頁外部假表載入失敗', error);
  dashboardState.externalLeave = {};
} finally {
  dashboardState.externalLeaveLoaded = true;
  updateDashboard();
}
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
const shiftRecordItems = (
  records,
  { type, icon, href, fallback, detailsFormatter }
) => {
  return records
    .map((record) => {
      const activity = getTodayActivity(record);
      if (!activity) return null;

     return {
    icon: isFireRecord(record) ? '🔥' : icon,
    time: formatRecordTime(activity.at),
    type,
    href: withRecordLink(href, record.id),
    title: todoTitle(record, fallback),
    details: detailsFormatter ? detailsFormatter(record) : null,

    isCreated: activity.kind === '建立',
    isUpdated: activity.kind === '更新',

    reminderEnabled: reminderIsEnabled(record),
    reminderTime: recordReminderAt(record),

    sortAt: activity.at?.getTime() || 0
};
    })
    .filter(Boolean);
};
const scheduleItems = () => scheduleOccurrencesForDay().map((item) => {
  const allDay = item.allDay || item.isAllDay;
  const labelColor = /^#[0-9a-f]{6}$/i.test(String(item.labelColor || ''))
    ? item.labelColor
    : '#3b82f6';
  return {
    icon: '📅',
    time: allDay ? '全天' : `${pad2(item.occurrenceAt.getHours())}:${pad2(item.occurrenceAt.getMinutes())}`,
    type: '排程',
    href: withRecordLink('service/schedule.html', item.id),
    title: item.title || '未命名事項',
    scheduleLabel: item.labelName || item.eventType || '排程',
    labelColor,
    sortAt: item.occurrenceAt.getTime()
  };
});

const reminderItems = (
    records,
    { type, icon, href, fallback }
) => {
  const today = new Date();

  return records
    .filter((record) => {
      const reminderAt = recordReminderAt(record);

      return (
        reminderIsEnabled(record) &&
        isSameDate(reminderAt, today)
      );
    })
    .map((record) => {
      const reminderAt = recordReminderAt(record);

      return {
          icon: icon || '⏰',
          time:formatRecordTime(reminderAt),
          type,
          href:withRecordLink(href,record.id),
          title:todoTitle(record,fallback),

          isCreated:false,
          isUpdated:false,
          reminderEnabled:true,
          reminderTime: reminderAt,

          sortAt:reminderAt?.getTime() || 0
      };
    });
};

const todoSectionDefinitions = [
  { key: 'home', label: '🏠首頁', types: ['排程'] },
  { key: 'service', label: '👥客服內部', types: ['對接追蹤', '交接'] },
  { key: 'work', label: '🗂️作業管理', types: ['日誌 NEW', '提報'] },
  { key: 'meeting', label: '🗂️會議歷程', types: ['會議'] },
  { key: 'database', label: '🧠資料庫', types: ['知識庫', 'AI 資料庫'] }
];
const todoSectionByKey = (key) => todoSectionDefinitions.find((section) => section.key === key);

const renderTodoFilters = (items) => {
  const container = document.querySelector('#dashboardTodoFilters');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '';
    container.hidden = true;
    dashboardState.selectedTodoSection = 'all';
    dashboardState.selectedTodoType = 'all';
    return;
  }

  container.hidden = false;
  const sectionButtons = todoSectionDefinitions.map((section) => ({
    ...section,
    count: items.filter((item) => section.types.includes(item.type)).length
  })).filter((section) => section.count > 0);
  const createdCount = items.filter((item) => item.isCreated).length;
  const updatedCount = items.filter((item) => item.isUpdated).length;
  const validSections = ['all', ...sectionButtons.map((section) => section.key), ...(createdCount ? ['created'] : []), ...(updatedCount ? ['updated'] : [])];
  if (!validSections.includes(dashboardState.selectedTodoSection)) {
    dashboardState.selectedTodoSection = 'all';
    dashboardState.selectedTodoType = 'all';
  }

  const buttons = [
    { key: 'all', label: '全部', count: items.length },
    ...sectionButtons,
    ...(createdCount ? [{ key: 'created', label: '建立', count: createdCount }] : []),
    ...(updatedCount ? [{ key: 'updated', label: '更新', count: updatedCount }] : [])
  ];
  container.innerHTML = buttons.map((button) => `
      <button
        type="button"
        class="todo-filter-btn ${dashboardState.selectedTodoSection === button.key ? 'active' : ''}"
        data-todo-section="${escapeDashboardHtml(button.key)}"
      >
        ${escapeDashboardHtml(button.label)} (${button.count})
      </button>
    `).join('');

  container.querySelectorAll('.todo-filter-btn').forEach((button) => {
    button.addEventListener('click', () => {
      dashboardState.selectedTodoSection = button.dataset.todoSection || 'all';
      dashboardState.selectedTodoType = 'all';
      renderTodoList();
    });
  });
};

const renderTodoEventFilters = (items) => {
  const container = document.querySelector('#todoEventFilter');
  if (!container) return;
  const section = todoSectionByKey(dashboardState.selectedTodoSection);
  if (!section) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }
  const typeButtons = section.types.map((type) => ({
    type,
    count: items.filter((item) => item.type === type).length
  })).filter((button) => button.count > 0);
  if (!typeButtons.length) {
    container.hidden = true;
    container.innerHTML = '';
    dashboardState.selectedTodoType = 'all';
    return;
  }
  if (!['all', ...typeButtons.map((button) => button.type)].includes(dashboardState.selectedTodoType)) {
    dashboardState.selectedTodoType = 'all';
  }
  container.hidden = false;
  container.innerHTML = typeButtons.map((button) => `
      <button
        class="todo-filter-btn ${dashboardState.selectedTodoType === button.type ? 'active' : ''}"
        data-todo-type="${escapeDashboardHtml(button.type)}">
        ${escapeDashboardHtml(button.type)} (${button.count})
      </button>
    `).join('');
  container.querySelectorAll('button').forEach(button => {
    button.onclick = () => {
      dashboardState.selectedTodoType = button.dataset.todoType || 'all';
      renderTodoList();
    };
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
      type: '日誌 NEW',
      icon: '✨',
      href: 'work/log-new.html',
      fallback: '日誌 NEW'
    }),
    ...reminderItems(dashboardState.logs, {
      type: '日誌 NEW',
      href: 'work/log-new.html',
      fallback: '日誌 NEW'
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
      detailsFormatter: trackingTodoDetails
    }),
    ...shiftRecordItems(dashboardState.meetings, {
      type: '會議',
      icon: '💬',
      href: 'meeting/meeting.html',
      fallback: '會議紀錄'
    }),
    ...reminderItems(dashboardState.handovers, {
      type: '交接',
      icon: '📋',
      href: 'work/handover.html',
      fallback: '交接事項'
    }),
    ...reminderItems(dashboardState.reports, {
      type: '提報',
      icon: '📌',
      href: 'work/report.html',
      fallback: '提報追蹤'
    }),
    ...reminderItems(dashboardState.tracking, {
      type: '對接追蹤',
      icon: '🔎',
      href: 'work/tracking.html',
      fallback: '對接追蹤'
    }),
    ...scheduleItems()
  ].sort((a, b) =>
   b.sortAt - a.sortAt ||
   String(a.type).localeCompare(String(b.type), 'zh-Hant') ||
   String(a.title).localeCompare(String(b.title), 'zh-Hant')
 );

  renderTodoFilters(items);
  renderTodoEventFilters(items);
  
  let filteredItems = items;

  // 第一層：區域或事件分類
  const selectedSection = todoSectionByKey(dashboardState.selectedTodoSection);
  if (selectedSection) {
    filteredItems = filteredItems.filter((item) => selectedSection.types.includes(item.type));
  }
  if (dashboardState.selectedTodoSection === 'created') filteredItems = filteredItems.filter((item) => item.isCreated);
  if (dashboardState.selectedTodoSection === 'updated') filteredItems = filteredItems.filter((item) => item.isUpdated);

  // 第二層：所選區域內的分頁
  if (selectedSection && dashboardState.selectedTodoType !== 'all') {
    filteredItems = filteredItems.filter((item) => item.type === dashboardState.selectedTodoType);
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
              ${item.scheduleLabel
                ? `<span class="todo-tag schedule" style="--schedule-label-color: ${escapeDashboardHtml(item.labelColor)}">
                    ● ${escapeDashboardHtml(item.scheduleLabel)}
                   </span>`
                : ''}
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
loadDashboardExternalLeave();
window.setInterval(loadDashboardExternalLeave, 60 * 1000);
window.addEventListener('focus', loadDashboardExternalLeave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadDashboardExternalLeave();
});
window.getShiftRange = getShiftRange;
window.getDefaultShift = getDefaultShift;
