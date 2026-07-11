const leaveDb = window.omniplayDb;
const leaveStaffCollection = leaveDb?.collection('staff');
const leaveCollection = leaveDb?.collection('leave');

const monthLabel = document.querySelector('#leaveMonthLabel');
const prevMonthButton = document.querySelector('#prevLeaveMonth');
const nextMonthButton = document.querySelector('#nextLeaveMonth');
const todayMonthButton = document.querySelector('#todayLeaveMonth');
const leaveTable = document.querySelector('#leaveTable');
const leaveTableHead = document.querySelector('#leaveTableHead');
const leaveTableBody = document.querySelector('#leaveTableBody');
const leaveStatus = document.querySelector('#leaveStatus');
const leaveLegend = document.querySelector('#leaveLegend');
const globalQuotaInput = document.querySelector('#globalLeaveQuota');
const specialModeButtons = document.querySelectorAll('.special-mode-button');

const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
const taiwanHolidays = {
  2026: {
    '02-14': '農曆春節',
    '02-15': '農曆春節',
    '02-16': '農曆春節',
    '02-17': '農曆春節',
    '02-18': '農曆春節',
    '02-19': '農曆春節',
    '02-20': '農曆春節',
    '02-21': '農曆春節',
    '02-22': '農曆春節',
    '02-27': '228 和平紀念日',
    '02-28': '228 和平紀念日',
    '03-01': '228 和平紀念日',
    '04-03': '兒童節＋清明節',
    '04-04': '兒童節＋清明節',
    '04-05': '兒童節＋清明節',
    '04-06': '兒童節＋清明節',
    '05-01': '勞動節',
    '05-02': '勞動節',
    '05-03': '勞動節',
    '06-19': '端午節',
    '06-20': '端午節',
    '06-21': '端午節',
    '09-25': '中秋＋教師節',
    '09-26': '中秋＋教師節',
    '09-27': '中秋＋教師節',
    '09-28': '中秋＋教師節',
    '10-09': '國慶日',
    '10-10': '國慶日',
    '10-11': '國慶日',
    '10-24': '光復節',
    '10-25': '光復節',
    '10-26': '光復節',
    '12-25': '行憲紀念日',
    '12-26': '行憲紀念日',
    '12-27': '行憲紀念日'
  }
};

let currentMonth = new Date();
currentMonth.setDate(1);
let staffList = [];
let leaveData = { records: {}, quotas: {}, shifts: {}, quota: 8 };
let unsubscribeStaff = null;
let unsubscribeLeave = null;
let activeSpecialMode = null;
let saveTimer = null;
const storedLeavePermission = () => {
  try { return JSON.parse(sessionStorage.getItem('omniplayPermissions') || '{}')?.pages?.leave; } catch { return null; }
};
let canEditLeave = Boolean(window.isOmniplayAdmin?.() || storedLeavePermission()?.edit === true);

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
const isSystemAdminStaff = (staff) => ['id', 'code', 'name'].some((field) => String(staff[field] || '').trim().toUpperCase() === 'OMNIPLAY');
const visibleLeaveStaff = (staff) => activeStaff(staff) && !isSystemAdminStaff(staff);
const getStaffSortOrder = (staff) => Number(staff.sortOrder ?? fixedStaffOrderMap[staff.name] ?? 999);
const normalizeShift = (value) => value === '晚班' ? '晚' : value === '早班' ? '早' : value;
const getStaffShift = (staff) => normalizeShift(staff.shift || leaveData.shifts?.[staff.id] || '早');
const sortStaffForLeave = (items) => [...items].sort((a, b) => {
  const shiftCompare = (getStaffShift(a) === '晚' ? 1 : 0) - (getStaffShift(b) === '晚' ? 1 : 0);
  if (shiftCompare) return shiftCompare;
  const orderCompare = getStaffSortOrder(a) - getStaffSortOrder(b);
  if (orderCompare) return orderCompare;
  return String(a.name || a.code || '').localeCompare(String(b.name || b.code || ''), 'zh-Hant');
});

const getHolidayName = (day) => {
  const key = `${pad(currentMonth.getMonth() + 1)}-${pad(day)}`;
  return taiwanHolidays[currentMonth.getFullYear()]?.[key] || '';
};

const getRecord = (staffId, day) => {
  const record = leaveData.records?.[`${staffId}_${dayKey(day)}`] || {};
  return { ...record, type: record.type || '', specials: record.specials || [] };
};
const getGlobalQuota = () => Number(leaveData.quota ?? 8);
const getQuota = () => getGlobalQuota();
const editableAttribute = () => canEditLeave ? '' : ' disabled';
const getShift = (staff) => getStaffShift(staff);
const leaveCount = (staffId) => Object.entries(leaveData.records || {}).filter(([key, record]) => key.startsWith(`${staffId}_`) && ['leave', 'required'].includes(record?.type)).length;

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
      quota: getGlobalQuota(),
      quotas: leaveData.quotas || {},
      shifts: leaveData.shifts || {},
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
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
    return `<th class="day-col ${weekend ? 'is-weekend' : ''} ${holiday ? 'is-holiday' : ''}" title="${escapeHtml(holiday)}"><span>${day}</span><small>${weekdayNames[date.getDay()]}${holiday ? `<br>${escapeHtml(holiday)}` : ''}</small></th>`;
  }).join('');
  leaveTableHead.innerHTML = `<tr><th class="sticky-col shift-col">班別</th><th class="sticky-col name-col">姓名</th>${dayHeaders}</tr>`;
};

const renderBody = () => {
  const totalDays = daysInMonth(currentMonth);
  const rows = staffList.map((staff) => {
    const used = leaveCount(staff.id);
    const quota = getQuota();
    const overQuota = used > quota;
    const cells = Array.from({ length: totalDays }, (_, index) => renderDayCell(staff, index + 1)).join('');
    return `<tr data-staff-id="${staff.id}" class="${overQuota ? 'is-over-quota' : ''}">
      <td class="sticky-col shift-col">
        <select class="leave-shift-select" data-action="shift" aria-label="${escapeHtml(staff.name)} 班別"${editableAttribute()}>
          <option value="早" ${getShift(staff) === '早' ? 'selected' : ''}>早</option>
          <option value="晚" ${getShift(staff) === '晚' ? 'selected' : ''}>晚</option>
        </select>
      </td>
      <th class="sticky-col name-col" scope="row">
        <span>${escapeHtml(staff.name || staff.code || '未命名')}</span>
        <small class="quota-count ${overQuota ? 'is-warning' : ''}">已休 ${used}</small>
      </th>${cells}</tr>`;
  }).join('');

  leaveTableBody.innerHTML = rows;
};

const renderDayCell = (staff, day) => {
  const record = getRecord(staff.id, day);
  const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
  const weekend = [0, 6].includes(date.getDay());
  const holiday = getHolidayName(day);
  const marker = record.type === 'required' ? '<span class="leave-marker is-required">▲</span>' : record.type === 'leave' ? '<span class="leave-marker">▲</span>' : '';
  const specials = (record.specials || []).map((item) => item === 'phone' ? '📱' : '🎰').join('');
  return `<td class="leave-day ${weekend ? 'is-weekend' : ''} ${holiday ? 'is-holiday' : ''}" data-staff-id="${staff.id}" data-day="${day}" title="${escapeHtml(holiday)}">
    <button type="button" class="leave-cell-button" data-action="toggle-leave" aria-label="${escapeHtml(staff.name)} ${day} 號休假狀態"${editableAttribute()}>${marker}<span class="special-icons">${specials}</span></button>
  </td>`;
};

const render = () => {
  monthLabel.textContent = `${currentMonth.getFullYear()} 年 ${currentMonth.getMonth() + 1} 月`;
  if (globalQuotaInput) {
    globalQuotaInput.value = getGlobalQuota();
    globalQuotaInput.disabled = !canEditLeave;
  }
  renderHeader();
  renderBody();
};

const subscribeMonth = () => {
  unsubscribeLeave?.();
  if (!leaveCollection) return;
  setStatus('載入休假表資料中...', 'info');
  unsubscribeLeave = leaveCollection.doc(monthKey(currentMonth)).onSnapshot((doc) => {
    leaveData = doc.exists ? { records: {}, quotas: {}, shifts: {}, quota: 8, ...doc.data() } : { records: {}, quotas: {}, shifts: {}, quota: 8 };
    staffList = sortStaffForLeave(staffList);
    render();
    setStatus('', 'success');
  }, (error) => {
    console.error('讀取休假表失敗：', error);
    setStatus('讀取休假表失敗，請稍後再試。', 'error');
  });
};

const changeMonth = (offset) => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
  setSpecialMode(null);
  subscribeMonth();
};

const toggleLeave = (staffId, day) => {
  const key = `${staffId}_${dayKey(day)}`;
  leaveData.records ||= {};
  const record = getRecord(staffId, day);
  const currentType = record.type || '';
  const nextType = currentType === '' ? 'leave' : currentType === 'leave' ? 'required' : '';
  leaveData.records[key] = { ...record, type: nextType };
  if (!nextType && !(record.specials || []).length) delete leaveData.records[key];
  const staff = staffList.find((item) => item.id === staffId);
  if (leaveCount(staffId) > getQuota()) alert(`${staff?.name || '此人員'} 已超過當月可休天數！`);
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
  leaveData.records ||= {};
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
  if (!canEditLeave) return;
  if (activeSpecialMode) {
    toggleSpecial(cell.dataset.staffId, cell.dataset.day, activeSpecialMode);
    return;
  }
  if (button.dataset.action === 'toggle-leave') toggleLeave(cell.dataset.staffId, cell.dataset.day);
});

const handleQuotaInput = (event) => {
  const target = event.target;
  if (!canEditLeave || target.dataset.action !== 'quota') return;
  updateGlobalQuota(target.value);
};

globalQuotaInput?.addEventListener('input', handleQuotaInput);

leaveTableBody?.addEventListener('change', (event) => {
  const target = event.target;
  const row = target.closest('tr[data-staff-id]');
  if (!row) return;
  if (!canEditLeave) return;
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
specialModeButtons.forEach((button) => {
  button.disabled = !canEditLeave;
  button.addEventListener('click', () => { if (canEditLeave) setSpecialMode(button.dataset.special); });
});

const updateGlobalQuota = (value) => {
  if (!canEditLeave) return;
  leaveData.quota = Number(value || 0);
  const exceededStaff = staffList.find((staff) => leaveCount(staff.id) > getQuota());
  if (exceededStaff) alert('已休天數超過當月全員可休天數！');
  render();
  queueSave();
};

if (!leaveDb) {
  setStatus('Firebase 尚未完成初始化，請確認 firebase-init.js 是否已載入。', 'error');
} else {
  unsubscribeStaff = leaveStaffCollection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    staffList = sortStaffForLeave(snapshot.docs.map(normalizeStaff).filter(visibleLeaveStaff));
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
});

const syncLeavePermission = async () => {
  if (window.isOmniplayAdmin?.()) {
    canEditLeave = true;
  } else {
    const staffId = sessionStorage.getItem('omniplayStaffId');
    const permissionsCollection = leaveDb?.collection('permissions');
    try {
      if (staffId && permissionsCollection) {
        const doc = await permissionsCollection.doc(staffId).get();
        if (doc.exists) sessionStorage.setItem('omniplayPermissions', JSON.stringify(doc.data()));
      }
    } catch (error) {
      console.error('讀取休假表權限失敗：', error);
    }
    canEditLeave = storedLeavePermission()?.edit === true;
  }
  specialModeButtons.forEach((button) => { button.disabled = !canEditLeave; });
  if (!canEditLeave) setSpecialMode(null);
  render();
};
syncLeavePermission();
