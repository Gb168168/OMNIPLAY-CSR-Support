const leaveDb = window.omniplayDb;
const leaveStaffCollection = leaveDb?.collection('staff');
const leaveCollection = leaveDb?.collection('leave');
const scheduleCollection = leaveDb?.collection('schedule');

const monthLabel = document.querySelector('#leaveMonthLabel');
const prevMonthButton = document.querySelector('#prevLeaveMonth');
const nextMonthButton = document.querySelector('#nextLeaveMonth');
const todayMonthButton = document.querySelector('#todayLeaveMonth');
const leaveTable = document.querySelector('#leaveTable');
const leaveTableHead = document.querySelector('#leaveTableHead');
const leaveTableBody = document.querySelector('#leaveTableBody');
const leaveStatus = document.querySelector('#leaveStatus');
const leaveLegend = document.querySelector('#leaveLegend');
const specialModeButtons = document.querySelectorAll('.special-mode-button');

const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
const fixedTaiwanHolidays = {
  '01-01': '元旦',
  '02-28': '和平紀念日',
  '04-04': '兒童節',
  '04-05': '清明節',
  '05-01': '勞動節',
  '10-10': '國慶日'
};
const taiwanHolidayOverrides = {
  2026: {
    '02-16': '農曆除夕',
    '02-17': '春節',
    '02-18': '春節',
    '02-19': '春節',
    '06-19': '端午節',
    '09-25': '中秋節'
  }
};

let currentMonth = new Date();
currentMonth.setDate(1);
let staffList = [];
let leaveData = { records: {}, quotas: {}, shifts: {} };
let scheduleByDay = {};
let unsubscribeStaff = null;
let unsubscribeLeave = null;
let unsubscribeSchedule = null;
let activeSpecialMode = null
let saveTimer = null;

const pad = (value) => String(value).padStart(2, '0');
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const dayKey = (day) => String(day);
const dateKey = (date, day) => `${monthKey(date)}-${pad(day)}`;
const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const setStatus = (message, type = 'info') => {
  if (!leaveStatus) return;
  leaveStatus.textContent = message;
  leaveStatus.dataset.type = type;
  leaveStatus.hidden = !message || type !== 'error';
};

const normalizeStaff = (doc) => ({ id: doc.id, ...doc.data() });
const fixedStaffOrder = ['中魁', '佳臻', '晴心', '澄希', '茗雅'];
const fixedStaffOrderMap = fixedStaffOrder.reduce((map, name, index) => ({ ...map, [name]: index + 1 }), {});
const activeStaff = (staff) => (staff.status || '啟用') === '啟用';
const getStaffSortOrder = (staff) => Number(staff.sortOrder ?? fixedStaffOrderMap[staff.name] ?? 999);
const getStaffShift = (staff) => staff.shift || leaveData.shifts?.[staff.id] || '早班';
const sortStaffForLeave = (items) => [...items].sort((a, b) => {
  const shiftCompare = (getStaffShift(a) === '晚班' ? 1 : 0) - (getStaffShift(b) === '晚班' ? 1 : 0);
  if (shiftCompare) return shiftCompare;
  const orderCompare = getStaffSortOrder(a) - getStaffSortOrder(b);
  if (orderCompare) return orderCompare;
  return String(a.name || a.code || '').localeCompare(String(b.name || b.code || ''), 'zh-Hant');
});

const getHolidayName = (day) => {
  const key = `${pad(currentMonth.getMonth() + 1)}-${pad(day)}`;
  return taiwanHolidayOverrides[currentMonth.getFullYear()]?.[key] || fixedTaiwanHolidays[key] || '';
};

const getRecord = (staffId, day) => leaveData.records?.[`${staffId}_${dayKey(day)}`] || { type: '', specials: [] };
const getQuota = (staffId) => Number(leaveData.quotas?.[staffId] ?? 8);
const getShift = (staff) => getStaffShift(staff);
const leaveCount = (staffId) => Object.entries(leaveData.records || {}).filter(([key, record]) => key.startsWith(`${staffId}_`) && ['leave', 'required'].includes(record?.type)).length;
const isWorking = (staffId, day) => !['leave', 'required'].includes(getRecord(staffId, day).type);

const queueSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveMonthData, 280);
};

const saveMonthData = async () => {
  if (!leaveCollection) return setStatus('Firebase 尚未完成初始化，無法儲存休假表。', 'error');
  try {
    await leaveCollection.doc(monthKey(currentMonth)).set({
      month: monthKey(currentMonth),
      records: leaveData.records || {},
      quotas: leaveData.quotas || {},
      shifts: leaveData.shifts || {},
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    setStatus('已自動儲存休假表。', 'success');
  } catch (error) {
    console.error('儲存休假表失敗：', error);
    setStatus('儲存休假表失敗，請稍後再試。', 'error');
  }
};

const renderHeader = () => {
  const totalDays = daysInMonth(currentMonth);
  const dayHeaders = Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const weekend = [0, 6].includes(date.getDay());
    const holiday = getHolidayName(day);
    return `<th class="day-col ${weekend ? 'is-weekend' : ''} ${holiday ? 'is-holiday' : ''}" title="${escapeHtml(holiday)}"><span>${day}</span><small>${weekdayNames[date.getDay()]}</small></th>`;
  }).join('');
  leaveTableHead.innerHTML = `<tr><th class="sticky-col shift-col">班別</th><th class="sticky-col name-col">姓名 / 可休</th>${dayHeaders}</tr>`;
};

const renderBody = () => {
  const totalDays = daysInMonth(currentMonth);
  const rows = staffList.map((staff) => {
    const used = leaveCount(staff.id);
    const quota = getQuota(staff.id);
    const overQuota = used > quota;
    const cells = Array.from({ length: totalDays }, (_, index) => renderDayCell(staff, index + 1)).join('');
    return `<tr data-staff-id="${staff.id}" class="${overQuota ? 'is-over-quota' : ''}">
      <td class="sticky-col shift-col">
        <select class="leave-shift-select" data-action="shift" aria-label="${escapeHtml(staff.name)} 班別">
          <option value="早班" ${getShift(staff) === '早班' ? 'selected' : ''}>早班</option>
          <option value="晚班" ${getShift(staff) === '晚班' ? 'selected' : ''}>晚班</option>
        </select>
      </td>
      <th class="sticky-col name-col" scope="row">
        <span>${escapeHtml(staff.name || staff.code || '未命名')}</span>
        <label class="quota-field"><span>可休</span><input type="number" min="0" max="31" value="${quota}" data-action="quota" aria-label="${escapeHtml(staff.name)} 當月可排休天數" /></label>
        <small class="quota-count ${overQuota ? 'is-warning' : ''}">已排 ${used}/${quota}</small>
      </th>${cells}</tr>`;
  }).join('');

  const workforceCells = Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const count = staffList.filter((staff) => isWorking(staff.id, day)).length;
    return `<td class="summary-cell">${count}</td>`;
  }).join('');
  const scheduleCells = Array.from({ length: totalDays }, (_, index) => {
    const titles = scheduleByDay[dateKey(currentMonth, index + 1)] || [];
    return `<td class="schedule-cell" title="${escapeHtml(titles.join('、'))}">${titles.map(escapeHtml).join('<br>') || '—'}</td>`;
  }).join('');

  leaveTableBody.innerHTML = `${rows}
    <tr class="summary-row"><td class="sticky-col shift-col">統計</td><th class="sticky-col name-col" scope="row">上班人力</th>${workforceCells}</tr>
    <tr class="schedule-row"><td class="sticky-col shift-col">排程</td><th class="sticky-col name-col" scope="row">排程</th>${scheduleCells}</tr>`;
};

const renderDayCell = (staff, day) => {
  const record = getRecord(staff.id, day);
  const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
  const weekend = [0, 6].includes(date.getDay());
  const holiday = getHolidayName(day);
  const marker = record.type === 'required' ? '<span class="leave-marker is-required">▲</span>' : record.type === 'leave' ? '<span class="leave-marker">▲</span>' : '';
  const specials = (record.specials || []).map((item) => item === 'phone' ? '📱' : '🎰').join('');
  return `<td class="leave-day ${weekend ? 'is-weekend' : ''} ${holiday ? 'is-holiday' : ''}" data-staff-id="${staff.id}" data-day="${day}" title="${escapeHtml(holiday)}">
    <button type="button" class="leave-cell-button" data-action="toggle-leave" aria-label="${escapeHtml(staff.name)} ${day} 號休假狀態">${marker}<span class="special-icons">${specials}</span></button>
  </td>`;
};

const render = () => {
  monthLabel.textContent = `${currentMonth.getFullYear()} 年 ${currentMonth.getMonth() + 1} 月`;
  renderHeader();
  renderBody();
};

const subscribeMonth = () => {
  unsubscribeLeave?.();
  unsubscribeSchedule?.();
  if (!leaveCollection) return;
  setStatus('載入休假表資料中...', 'info');
  unsubscribeLeave = leaveCollection.doc(monthKey(currentMonth)).onSnapshot((doc) => {
    leaveData = doc.exists ? { records: {}, quotas: {}, shifts: {}, ...doc.data() } : { records: {}, quotas: {}, shifts: {} };
    staffList = sortStaffForLeave(staffList);
    render();
    setStatus('', 'success');
  }, (error) => {
    console.error('讀取休假表失敗：', error);
    setStatus('讀取休假表失敗，請稍後再試。', 'error');
  });
  subscribeSchedule();
};

const subscribeSchedule = () => {
  scheduleByDay = {};
  if (!scheduleCollection) return render();
  unsubscribeSchedule = scheduleCollection.onSnapshot((snapshot) => {
    scheduleByDay = {};
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const rawDate = data.date || data.day || data.startDate || data.scheduleDate || doc.id;
      const key = typeof rawDate === 'string' ? rawDate.slice(0, 10) : rawDate?.toDate?.().toISOString().slice(0, 10);
      if (!key?.startsWith(monthKey(currentMonth))) return;
      scheduleByDay[key] ||= [];
      scheduleByDay[key].push(data.title || data.name || data.subject || '未命名排程');
    });
    render();
  }, (error) => console.error('讀取排程失敗：', error));
};

const changeMonth = (offset) => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
  setSpecialMode(null);
  subscribeMonth();
};

const toggleLeave = (staffId, day) => {
  const key = `${staffId}_${dayKey(day)}`;
  const record = getRecord(staffId, day);
  const nextType = record.type === '' ? 'leave' : record.type === 'leave' ? 'required' : '';
  leaveData.records[key] = { ...record, type: nextType };
  if (!nextType && !(record.specials || []).length) delete leaveData.records[key];
  const staff = staffList.find((item) => item.id === staffId);
  if (leaveCount(staffId) > getQuota(staffId)) alert(`${staff?.name || '此人員'} 已超過當月可排休天數！`);
  render();
  queueSave();
};

const setSpecialMode = (mode) => {
  activeSpecialMode = activeSpecialMode === mode ? null : mode;
  if (!mode) activeSpecialMode = null;
  specialModeButtons.forEach((button) => {
    const isActive = button.dataset.special === activeSpecialMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  leaveTable?.classList.toggle('is-special-mode', Boolean(activeSpecialMode));
};

const toggleSpecial = (staffId, day, specialType) => {
  const key = `${staffId}_${dayKey(day)}`;
  const record = getRecord(staffId, day);
  const specials = new Set(record.specials || []);
  specials.has(specialType) ? specials.delete(specialType) : specials.add(specialType);
  const nextSpecials = [...specials];
  leaveData.records[key] = { ...record, specials: nextSpecials };
  if (!record.type && !nextSpecials.length) delete leaveData.records[key];
  render();
  queueSave();
};

leaveTableBody?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const cell = button.closest('.leave-day');
  if (!cell) return;
  if (activeSpecialMode) {
    toggleSpecial(cell.dataset.staffId, cell.dataset.day, activeSpecialMode);
    return;
  }
  if (button.dataset.action === 'toggle-leave') toggleLeave(cell.dataset.staffId, cell.dataset.day);
});

leaveTableBody?.addEventListener('change', (event) => {
  const target = event.target;
  const row = target.closest('tr[data-staff-id]');
  if (!row) return;
  if (target.dataset.action === 'quota') {
    leaveData.quotas[row.dataset.staffId] = Number(target.value || 0);
    if (leaveCount(row.dataset.staffId) > getQuota(row.dataset.staffId)) alert('已排休天數超過此人員當月可排休天數！');
  }
  if (target.dataset.action === 'shift') {
    const staff = staffList.find((item) => item.id === row.dataset.staffId);
    if (staff) staff.shift = target.value;
    leaveData.shifts ||= {};
    leaveData.shifts[row.dataset.staffId] = target.value;
    leaveStaffCollection?.doc(row.dataset.staffId).update({
      shift: target.value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch((error) => console.error('更新班別失敗：', error));
  }
  staffList = sortStaffForLeave(staffList);
  render();
  queueSave();
});


prevMonthButton?.addEventListener('click', () => changeMonth(-1));
nextMonthButton?.addEventListener('click', () => changeMonth(1));
todayMonthButton?.addEventListener('click', () => { currentMonth = new Date(); currentMonth.setDate(1); setSpecialMode(null); subscribeMonth(); });
specialModeButtons.forEach((button) => button.addEventListener('click', () => setSpecialMode(button.dataset.special)));

if (!leaveDb) {
  setStatus('Firebase 尚未完成初始化，請確認 firebase-init.js 是否已載入。', 'error');
} else {
  unsubscribeStaff = leaveStaffCollection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    staffList = sortStaffForLeave(snapshot.docs.map(normalizeStaff).filter(activeStaff));
    render();
  }, (error) => {
    console.error('讀取人員資料失敗：', error);
    setStatus('讀取人員資料失敗，請稍後再試。', 'error');
  });
  subscribeMonth();
}

window.addEventListener('beforeunload', () => {
  unsubscribeStaff?.();
  unsubscribeLeave?.();
  unsubscribeSchedule?.();
});
