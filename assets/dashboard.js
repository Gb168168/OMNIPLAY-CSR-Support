const dashboardDb = window.omniplayDb;
const dashboardCollections = {
  staff: dashboardDb?.collection('staff'),
  leave: dashboardDb?.collection('leave'),
  handover: dashboardDb?.collection('handover'),
  tracking: dashboardDb?.collection('tracking'),
  log: dashboardDb?.collection('log'),
  schedule: dashboardDb?.collection('schedule')
};

const dashboardState = { staff: [], leave: {}, handovers: [], tracking: [], logs: [], schedules: [], selectedShift: getDefaultShift() };
const todoList = document.querySelector('#dashboardTodoList');
const todayScheduleList = document.querySelector('#dashboardTodayScheduleList');
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
}
  if (shift === 'morning') {
    return {
      start: new Date(today.getTime() + 8 * 60 * 60 * 1000),
      end: new Date(today.getTime() + 20 * 60 * 60 * 1000)
    };
  }
  
  const nightBase = new Date(today);
  if (now.getHours() < 20) nightBase.setDate(nightBase.getDate() - 1);
  return {
    start: new Date(nightBase.getTime() + 20 * 60 * 60 * 1000),
    end: new Date(nightBase.getTime() + 32 * 60 * 60 * 1000)
  };
}

function getDefaultShift() {
  const hour = new Date().getHours();
  if (hour >= 20 || hour < 8) return 'morning';
  return 'night';
}

const isInShiftRange = (record = {}, range) => {
  const createdAt = valueDate(record.createdAt) || valueDate(record.createdDate);
  const updatedAt = valueDate(record.updatedAt) || valueDate(record.updatedDate);
  return [createdAt, updatedAt].some((at) => at && at >= range.start && at <= range.end);
};

const shiftLogs = () => {
  const range = getShiftRange(dashboardState.selectedShift);
  return dashboardState.logs.filter((record) => isInShiftRange(record, range));
};

const shiftHandovers = () => {
  const range = getShiftRange(dashboardState.selectedShift);
  return dashboardState.handovers.filter((record) => record.fire === true || isInShiftRange(record, range));
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

const scheduleOccurrencesForDay = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const items = [];
  const addOccurrence = (item, occurrenceAt, isRepeat) => {
    items.push({ ...item, occurrenceAt, isRepeatOccurrence: isRepeat });
  };

  dashboardState.schedules.filter((item) => !item.deleted).forEach((item) => {
    const original = valueDate(item.reminderAt) || new Date(`${item.date}T00:00:00`);
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
  const fireHandovers = shiftHandovers();
  const openStatuses = new Set(['待辦中', '處理中', '觀察中']);
  const logs = shiftLogs();
  setText('#handoverFireCount', fireHandovers.length);
  setText('#trackingOpenCount', dashboardState.tracking.filter((record) => openStatuses.has(String(record.status || record['進度狀態'] || '').trim())).length);
  setText('#shiftLogCount', logs.length);
  updateTodayWorking();
  updateShiftButtons();
  renderTodoList(logs, fireHandovers);
  renderTodaySchedules();
};

const updateShiftButtons = () => {
  document.querySelectorAll('.shift-btn').forEach((button) => {
    const active = button.dataset.shift === dashboardState.selectedShift;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
};

const todoTitle = (record = {}, fallback) => record.subject || record.item || record.category || record.content || record.note || record.serial || fallback;
const renderTodoList = (logs, handovers) => {
  if (!todoList) return;
  const items = [
    ...logs.map((record) => ({ type: '日誌', href: 'work/log.html', title: todoTitle(record, '日誌'), meta: record.shift || record.staff || record.date || '' })),
    ...handovers.map((record) => ({ type: '交接', href: 'work/handover.html', title: todoTitle(record, '交接事項'), meta: record.status || record.publisher || record.date || '' }))
  ];
  todoList.innerHTML = items.length ? items.map((item) => `<li><a href="${item.href}"><span class="todo-type">${item.type}</span><strong>${escapeDashboardHtml(item.title)}</strong><small>${escapeDashboardHtml(item.meta)}</small></a></li>`).join('') : '<li class="dashboard-empty">目前沒有交接時間日誌或 🔥 交接項目。</li>';
};
const renderTodaySchedules = () => {
  if (!todayScheduleList) return;
  const items = scheduleOccurrencesForDay();
  todayScheduleList.innerHTML = items.length ? items.map((item) => {
    const allDay = item.allDay || item.isAllDay;
    const time = allDay ? '全天' : `${pad2(item.occurrenceAt.getHours())}:${pad2(item.occurrenceAt.getMinutes())}`;
    return `<li><a href="service/schedule.html"><span class="schedule-dot" style="--event-color:${escapeDashboardHtml(item.labelColor || '#3b82f6')}"></span><time>${time}</time><strong>${escapeDashboardHtml(item.title || '未命名事項')}</strong></a></li>`;
  }).join('') : '<li class="dashboard-empty">今日無排定事項</li>';
};

const escapeDashboardHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

const subscribeDashboard = () => {
  if (!dashboardDb) return;
  dashboardCollections.staff?.onSnapshot((snapshot) => { dashboardState.staff = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.leave?.doc(monthKey()).onSnapshot((doc) => { dashboardState.leave = doc.exists ? { records: {}, ...doc.data() } : { records: {} }; updateDashboard(); });
  dashboardCollections.handover?.onSnapshot((snapshot) => { dashboardState.handovers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.tracking?.onSnapshot((snapshot) => { dashboardState.tracking = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.log?.onSnapshot((snapshot) => { dashboardState.logs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.schedule?.onSnapshot((snapshot) => { dashboardState.schedules = snapshot.docs.map((doc) => ({ id: doc.id, labelColor: '#3b82f6', ...doc.data() })); updateDashboard(); });
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
