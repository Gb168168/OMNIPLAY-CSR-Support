const dashboardDb = window.omniplayDb;
const dashboardCollections = {
  staff: dashboardDb?.collection('staff'),
  leave: dashboardDb?.collection('leave'),
  handover: dashboardDb?.collection('handover'),
  tracking: dashboardDb?.collection('tracking'),
  log: dashboardDb?.collection('log')
};

const dashboardState = { staff: [], leave: {}, handovers: [], tracking: [], logs: [] };
const todoList = document.querySelector('#dashboardTodoList');
const setText = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = String(value); };
const pad2 = (value) => String(value).padStart(2, '0');
const monthKey = (date = new Date()) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
const dayKey = (date = new Date()) => pad2(date.getDate());
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
const recordTime = (record = {}) => valueDate(record.updatedAt) || valueDate(record.createdAt) || valueDate(record.updatedDate) || valueDate(record.createdDate) || valueDate(record.date);

function shouldShowLogs(now = new Date()) {
  const hour = now.getHours();
  if (hour >= 19 && hour < 20) return 'morning';
  if (hour >= 7 && hour < 8) return 'night';
  if (hour >= 20 || hour < 7) return null;
  if (hour >= 8 && hour < 19) return null;
  return null;
}

const currentShiftWindow = (now = new Date()) => {
  const shift = shouldShowLogs(now);
  if (!shift) return null;
  const start = new Date(now);
  const end = new Date(now);
  if (shift === 'morning') {
    start.setHours(8, 0, 0, 0);
    end.setHours(20, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 1);
    start.setHours(20, 0, 0, 0);
    end.setHours(8, 0, 0, 0);
  }
  return { shift, start, end };
};

const shiftLogs = () => {
  const range = currentShiftWindow();
  if (!range) return [];
  return dashboardState.logs.filter((record) => {
    const at = recordTime(record);
    return at && at >= range.start && at <= range.end;
  });
};

const updateTodayWorking = () => {
  const todayKey = dayKey();
  const records = dashboardState.leave.records || {};
  const count = dashboardState.staff.filter((staff) => isActiveStaff(staff) && !isSystemStaff(staff)).filter((staff) => {
    const record = records[`${staff.id}_${todayKey}`] || {};
    return !['leave', 'required'].includes(record.type) && !(record.specials || []).includes('phone');
  }).length;
  setText('#todayWorkingCount', count);
};

const updateDashboard = () => {
  const fireHandovers = dashboardState.handovers.filter((record) => record.fire === true);
  const openStatuses = new Set(['待辦中', '處理中', '觀察中']);
  const logs = shiftLogs();
  setText('#handoverFireCount', fireHandovers.length);
  setText('#trackingOpenCount', dashboardState.tracking.filter((record) => openStatuses.has(String(record.status || record['進度狀態'] || '').trim())).length);
  setText('#shiftLogCount', logs.length);
  updateTodayWorking();
  renderTodoList(logs, fireHandovers);
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
const escapeDashboardHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

const subscribeDashboard = () => {
  if (!dashboardDb) return;
  dashboardCollections.staff?.onSnapshot((snapshot) => { dashboardState.staff = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.leave?.doc(monthKey()).onSnapshot((doc) => { dashboardState.leave = doc.exists ? { records: {}, ...doc.data() } : { records: {} }; updateDashboard(); });
  dashboardCollections.handover?.onSnapshot((snapshot) => { dashboardState.handovers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.tracking?.onSnapshot((snapshot) => { dashboardState.tracking = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
  dashboardCollections.log?.onSnapshot((snapshot) => { dashboardState.logs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); updateDashboard(); });
};

subscribeDashboard();
window.shouldShowLogs = shouldShowLogs;
