const scheduleDb = window.omniplayDb;
const scheduleCollection = scheduleDb?.collection('schedule');
const scheduleLabelCollection = scheduleDb?.collection('scheduleLabels');
const scheduleStaffCollection = scheduleDb?.collection('staff');
const scheduleLeaveCollection = scheduleDb?.collection('leave');

const calendarEl = document.querySelector('#scheduleCalendar');
const periodLabel = document.querySelector('#schedulePeriodLabel');
const statusEl = document.querySelector('#scheduleStatus');
const selectedDateEl = document.querySelector('#selectedScheduleDate');
const modalEl = document.querySelector('#scheduleModal');
const modalTitleEl = document.querySelector('#scheduleModalTitle');
const formEl = document.querySelector('#scheduleForm');
const messageEl = document.querySelector('#scheduleFormMessage');
const deleteButton = document.querySelector('#deleteScheduleButton');
const colorInput = document.querySelector('#scheduleLabelColor');
const labelNameInput = document.querySelector('#scheduleLabelName');
const savedLabelsEl = document.querySelector('#scheduleSavedLabels');
const staffSelect = document.querySelector('#scheduleStaff');
const historyListEl = document.querySelector('#scheduleHistoryList');
const tooltipEl = document.querySelector('#scheduleSpecialTooltip');
const repeatSelect = document.querySelector('#scheduleRepeat');
const repeatIntervalInput = document.querySelector('#scheduleRepeatInterval');
const repeatIntervalLabel = document.querySelector('#scheduleRepeatIntervalLabel');
const periodPicker = document.querySelector('#schedulePeriodPicker');
const yearSelect = document.querySelector('#scheduleYearSelect');
const monthPicker = document.querySelector('#scheduleMonthPicker');
const labelFilterSelect = document.querySelector('#scheduleLabelFilter');

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const SCHEDULE_SESSION_KEYS = { id: 'omniplayStaffId', code: 'omniplayStaffCode', name: 'omniplayStaffName' };
const pad = (value) => String(value).padStart(2, '0');
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toMonthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const parseDateValue = (value) => value?.toDate?.() || (typeof value === 'string' ? new Date(value) : value instanceof Date ? value : null);
const toDatetimeLocal = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const daysBetween = (start, end) => Math.floor((new Date(end.getFullYear(), end.getMonth(), end.getDate()) - new Date(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
const addMonthsClamped = (date, count) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + count);
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
};
const isSameDay = (a, b) => toDateKey(a) === toDateKey(b);
const activeStaff = (staff) => (staff.status || '啟用') === '啟用';
const currentUser = () => ({
  id: sessionStorage.getItem(SCHEDULE_SESSION_KEYS.id) || '',
  code: sessionStorage.getItem(SCHEDULE_SESSION_KEYS.code) || '',
  name: sessionStorage.getItem(SCHEDULE_SESSION_KEYS.name) || '未登入人員'
});

let currentDate = new Date();
let selectedDate = new Date();
let viewMode = 'month';
let staffList = [];
let scheduleList = [];
let labelList = [];
let leaveData = { records: {} };
let editingId = null;
let unsubscribeStaff = null;
let unsubscribeSchedules = null;
let unsubscribeLabels = null;
let unsubscribeLeave = null;
let activeLabelFilter = '';

const storedSchedulePermission = () => window.getPagePermission?.('schedule') || { view: false, edit: false, delete: false, design: false };
let canEditSchedule = Boolean(window.isOmniplayAdmin?.());
let canDeleteSchedule = Boolean(window.isOmniplayAdmin?.());

const syncSchedulePermission = async () => {
  if (window.permissionReady) await window.permissionReady;
  const permission = storedSchedulePermission();
  canEditSchedule = Boolean(window.isOmniplayAdmin?.() || permission.edit === true);
  canDeleteSchedule = Boolean(window.isOmniplayAdmin?.() || permission.delete === true);
  document.querySelector('#saveScheduleButton')?.toggleAttribute('hidden', !canEditSchedule);
  document.querySelector('#saveScheduleButton')?.toggleAttribute('disabled', !canEditSchedule);
  if (deleteButton) deleteButton.hidden = !canDeleteSchedule || !editingId;
  formEl?.querySelectorAll('input, textarea, select').forEach((control) => { control.disabled = !canEditSchedule; });
};


const setStatus = (message, type = 'info') => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.type = type;
  statusEl.hidden = type !== 'error';
};

const setMessage = (message, type = 'error') => {
  if (!messageEl) return;
  messageEl.textContent = message;
  messageEl.dataset.type = type;
  messageEl.hidden = !message;
};

const getVisibleRange = () => {
  if (viewMode === 'year') {
    const start = new Date(currentDate.getFullYear(), 0, 1);
    const end = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start, end };
  }
  if (viewMode === 'week') {
    const start = new Date(currentDate);
    start.setDate(currentDate.getDate() - currentDate.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  end.setDate(end.getDate() + (6 - end.getDay()));
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getRepeatStepDays = (item) => {
  if (item.repeat === 'daily') return 1;
  if (item.repeat === 'weekly') return 7;
  if (item.repeat === 'custom') return Math.max(1, Number(item.repeatInterval) || 1);
  return 0;
};

const getScheduleOccurrencesByDay = (start, end) => scheduleList.filter((item) => !item.deleted && scheduleMatchesActiveLabel(item)).reduce((groups, item) => {
  const original = parseDateValue(item.reminderAt) || new Date(`${item.date}T00:00:00`);
  if (!(original instanceof Date) || Number.isNaN(original.getTime())) return groups;
  const addOccurrence = (date, isRepeat) => {
    const key = toDateKey(date);
    groups[key] ||= [];
    groups[key].push({ ...item, occurrenceDate: key, isRepeatOccurrence: isRepeat });
  };
  if (original >= start && original <= end) addOccurrence(original, false);
  const repeat = item.repeat || 'none';
  if (repeat === 'monthly') {
    for (let i = 1, occurrence = addMonthsClamped(original, i); occurrence <= end; i += 1, occurrence = addMonthsClamped(original, i)) {
      if (occurrence >= start) addOccurrence(occurrence, true);
    }
    return groups;
  }
  const step = getRepeatStepDays(item);
  if (!step) return groups;
  const firstOffset = Math.max(step, Math.ceil(Math.max(1, daysBetween(original, start)) / step) * step);
  for (let offset = firstOffset; ; offset += step) {
    const occurrence = new Date(original);
    occurrence.setDate(original.getDate() + offset);
    if (occurrence > end) break;
    if (occurrence >= start) addOccurrence(occurrence, true);
  }
  return groups;
}, {});

const renderStaffOptions = () => {
  if (!staffSelect) return;
  staffSelect.innerHTML = staffList.map((staff) => `<option value="${staff.id}">${escapeHtml(staff.name || staff.code || '未命名')}</option>`).join('');
};

const renderSavedLabels = () => {
  if (!savedLabelsEl) return;
  savedLabelsEl.innerHTML = labelList.length
    ? labelList.map((label) => `<button class="saved-label-chip" type="button" data-color="${escapeHtml(label.color)}" data-name="${escapeHtml(label.name)}"><i style="background:${escapeHtml(label.color)}"></i><span>${escapeHtml(label.name || '未命名')}</span></button>`).join('')
    : '<span class="saved-label-empty">尚無已設置標籤</span>';
};

const renderLabelFilter = () => {
  if (!labelFilterSelect) return;
  const previousValue = activeLabelFilter;
  const options = labelList
    .filter((label) => label.name)
    .map((label) => {
      const value = label.id || label.name;
      const selected = value === previousValue ? 'selected' : '';
      const color = escapeHtml(label.color || '#3b82f6');
      return `<option value="${escapeHtml(value)}" data-name="${escapeHtml(label.name)}" data-color="${color}" style="color:${color}" ${selected}>● ${escapeHtml(label.name)}</option>`;
    }).join('');
  labelFilterSelect.innerHTML = `<option value="">全部標籤</option>${options}`;
  const stillExists = !previousValue || [...labelFilterSelect.options].some((option) => option.value === previousValue);
  activeLabelFilter = stillExists ? previousValue : '';
  labelFilterSelect.value = activeLabelFilter;
  if (!stillExists) renderCalendar();
};

const scheduleMatchesActiveLabel = (item) => {
  if (!activeLabelFilter) return true;
  const selectedOption = labelFilterSelect?.selectedOptions?.[0];
  const selectedName = selectedOption?.dataset?.name || '';
  return item.labelId === activeLabelFilter || item.labelName === selectedName || item.labelName === activeLabelFilter;
};

const renderHistory = (history = []) => {
  if (!historyListEl) return;
  historyListEl.innerHTML = history.length
    ? history.slice().reverse().map((entry) => {
      const time = parseDateValue(entry.at);
      return `<div class="history-item"><span>${escapeHtml(time ? time.toLocaleString('zh-TW', { hour12: false }) : '—')}</span><strong>${escapeHtml(entry.userName || '未記錄')}</strong><em>${escapeHtml(entry.action || '編輯')}</em></div>`;
    }).join('')
    : '<p class="history-empty">尚無歷程</p>';
};

const renderCalendar = () => {
  if (!calendarEl) return;
  const today = new Date();
  calendarEl.classList.toggle('is-year-view', viewMode === 'year');
  const { start, end } = getVisibleRange();
  const schedulesByDay = getScheduleOccurrencesByDay(start, end);
  const days = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) days.push(new Date(cursor));

  if (periodLabel) {
    periodLabel.textContent = viewMode === 'week'
      ? `${toDateKey(start)} ~ ${toDateKey(end)}`
      : viewMode === 'year'
        ? `${currentDate.getFullYear()} 年`
        : `${currentDate.getFullYear()}年${pad(currentDate.getMonth() + 1)}月`;
  }
  renderPeriodPicker();
  if (selectedDateEl) selectedDateEl.textContent = toDateKey(selectedDate);

  if (viewMode === 'year') {
    calendarEl.innerHTML = Array.from({ length: 12 }, (_, index) => {
      const monthItems = days.filter((day) => day.getMonth() === index).flatMap((day) => schedulesByDay[toDateKey(day)] || []);
      return `<button class="calendar-month-card ${index === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear() ? 'is-current' : ''}" type="button" data-month="${index}"><strong>${index + 1}月</strong><span>${monthItems.length} 筆排程</span></button>`;
    }).join('');
    return;
  }
  
  const header = weekdays.map((day, index) => `<div class="calendar-weekday weekday-${index}">${day}</div>`).join('');
  const cells = days.map((day) => {
    const key = toDateKey(day);
    const items = (schedulesByDay[key] || []).sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant'));
    const otherMonth = day.getMonth() !== currentDate.getMonth() && viewMode === 'month';
    return `<button class="calendar-day weekday-${day.getDay()} ${otherMonth ? 'is-muted' : ''} ${isSameDay(day, today) ? 'is-today' : ''} ${isSameDay(day, selectedDate) ? 'is-selected' : ''}" type="button" data-date="${key}">
      <span class="day-number">${day.getDate()}</span>
      <span class="day-events">${items.map((item) => `<span class="calendar-event ${item.isRepeatOccurrence ? 'is-repeat' : ''}" data-id="${item.id}" style="--event-color:${escapeHtml(item.labelColor)}"><i></i>${escapeHtml(item.title)}</span>`).join('')}</span>
    </button>`;
  }).join('');
  calendarEl.innerHTML = header + cells;
};

const subscribeLeave = () => {
  unsubscribeLeave?.();
  if (!scheduleLeaveCollection) return;
  unsubscribeLeave = scheduleLeaveCollection.doc(toMonthKey(selectedDate)).onSnapshot((doc) => { leaveData = doc.exists ? { records: {}, ...doc.data() } : { records: {} }; });
};


const openScheduleFromQuery = () => {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id || editingId === id || modalEl?.classList.contains('is-open')) return;
  const item = scheduleList.find((entry) => entry.id === id && !entry.deleted);
  if (!item) return;
  const at = parseDateValue(item.reminderAt) || new Date(`${item.date}T09:00`);
  currentDate = new Date(at);
  selectedDate = new Date(at);
  openModal(toDateKey(at), id);
};

const subscribeSchedules = () => {
  unsubscribeSchedules?.();
  if (!scheduleCollection) return;
  setStatus('載入資料中...', 'info');
  unsubscribeSchedules = scheduleCollection.onSnapshot((snapshot) => {
    scheduleList = snapshot.docs.map((doc) => {
      const data = doc.data();
      const reminder = parseDateValue(data.reminderAt);
      return { id: doc.id, ...data, date: data.date || (reminder ? toDateKey(reminder) : doc.id.slice(0, 10)), labelColor: data.labelColor || '#3b82f6', history: data.history || [] };
    });
    renderCalendar();
    openScheduleFromQuery();
    setStatus('資料已載入。', 'success');
  }, (error) => { console.error('讀取排程失敗：', error); setStatus('讀取資料失敗。', 'error'); });
};

const subscribeLabels = () => {
  unsubscribeLabels?.();
  if (!scheduleLabelCollection) return;
  unsubscribeLabels = scheduleLabelCollection.orderBy('updatedAt', 'desc').onSnapshot((snapshot) => {
    labelList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderSavedLabels();
    renderLabelFilter();
  }, (error) => console.error('讀取標籤失敗：', error));
};

const selectDefaultStaff = (item) => {
  const ids = item?.staffIds?.length ? item.staffIds : [currentUser().id].filter(Boolean);
  [...staffSelect.options].forEach((option) => { option.selected = ids.includes(option.value); });
};

const openModal = (dateKey, scheduleId = null) => {
  editingId = scheduleId;
  const item = scheduleList.find((entry) => entry.id === scheduleId);
  formEl.reset();
  setMessage('');
  modalTitleEl.textContent = item ? '編輯排程' : '新增排程';
  deleteButton.hidden = !item || !canDeleteSchedule;
  colorInput.value = item?.labelColor || '#3b82f6';
  labelNameInput.value = item?.labelName || '';
  document.querySelector('#scheduleTitle').value = item?.title || '';
  document.querySelector('#scheduleContent').value = item?.content || '';
  document.querySelector('#scheduleReminderAt').value = toDatetimeLocal(item?.reminderAt ? parseDateValue(item.reminderAt) : new Date(`${dateKey}T09:00`));
  repeatSelect.value = item?.repeat || 'none';
  repeatIntervalInput.value = item?.repeatInterval || 1;
  toggleRepeatInterval();
  selectDefaultStaff(item);
  renderHistory(item?.history || []);
  formEl?.querySelectorAll('input, textarea, select').forEach((control) => { control.disabled = !canEditSchedule; });
  document.querySelector('#saveScheduleButton')?.toggleAttribute('hidden', !canEditSchedule);
  document.querySelector('#saveScheduleButton')?.toggleAttribute('disabled', !canEditSchedule);
  modalEl.classList.add('is-open');
  modalEl.setAttribute('aria-hidden', 'false');
};

const closeModal = () => { modalEl.classList.remove('is-open'); modalEl.setAttribute('aria-hidden', 'true'); editingId = null; };

const showSpecials = (type, anchor) => {
  if (!tooltipEl) return;
  const names = Object.entries(leaveData.records || {}).filter(([, record]) => (record.specials || []).includes(type)).map(([key]) => {
    const [staffId, day] = key.split('_');
    if (Number(day) !== selectedDate.getDate()) return '';
    return staffList.find((staff) => staff.id === staffId)?.name;
  }).filter(Boolean);
  tooltipEl.innerHTML = `<strong>${type === 'phone' ? '📱 值公務機' : '🎰 公司活動'}｜${escapeHtml(toDateKey(selectedDate))}</strong><p>${names.length ? names.map(escapeHtml).join('、') : '當天沒有名單'}</p>`;
  const rect = anchor.getBoundingClientRect();
  tooltipEl.style.right = `${Math.max(16, window.innerWidth - rect.right)}px`;
  tooltipEl.style.top = `${rect.bottom + 8}px`;
  tooltipEl.hidden = false;
};

const saveLabelIfNeeded = async (name, color) => {
  if (!scheduleLabelCollection || !name) return;
  const same = labelList.find((label) => label.name === name && label.color === color);
  if (same) return;
  await scheduleLabelCollection.add({ name, color, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
};


const toggleRepeatInterval = () => {
  if (!repeatIntervalLabel || !repeatSelect) return;
  repeatIntervalLabel.hidden = repeatSelect.value !== 'custom';
  repeatIntervalInput.required = repeatSelect.value === 'custom';
};

const renderPeriodPicker = () => {
  if (!yearSelect || !monthPicker) return;
  const year = currentDate.getFullYear();
  yearSelect.innerHTML = Array.from({ length: 21 }, (_, index) => year - 10 + index)
    .map((optionYear) => `<option value="${optionYear}" ${optionYear === year ? 'selected' : ''}>${optionYear}年</option>`).join('');
  monthPicker.innerHTML = Array.from({ length: 12 }, (_, index) => `<button class="month-picker-button ${index === currentDate.getMonth() ? 'is-active' : ''}" type="button" data-month="${index}">${index + 1}月</button>`).join('');
};

const closePeriodPicker = () => {
  if (!periodPicker) return;
  periodPicker.hidden = true;
  periodLabel?.setAttribute('aria-expanded', 'false');
};

repeatSelect?.addEventListener('change', toggleRepeatInterval);
periodLabel?.addEventListener('click', (event) => {
  event.stopPropagation();
  renderPeriodPicker();
  periodPicker.hidden = !periodPicker.hidden;
  periodLabel.setAttribute('aria-expanded', String(!periodPicker.hidden));
});
yearSelect?.addEventListener('change', () => { currentDate.setFullYear(Number(yearSelect.value)); selectedDate = new Date(currentDate); renderCalendar(); });
document.querySelector('#prevPickerYear')?.addEventListener('click', () => { currentDate.setFullYear(currentDate.getFullYear() - 1); selectedDate = new Date(currentDate); renderCalendar(); });
document.querySelector('#nextPickerYear')?.addEventListener('click', () => { currentDate.setFullYear(currentDate.getFullYear() + 1); selectedDate = new Date(currentDate); renderCalendar(); });
monthPicker?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-month]');
  if (!button) return;
  currentDate = new Date(currentDate.getFullYear(), Number(button.dataset.month), 1);
  selectedDate = new Date(currentDate);
  viewMode = viewMode === 'year' ? 'month' : viewMode;
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', item.dataset.view === viewMode));
  subscribeLeave();
  renderCalendar();
  closePeriodPicker();
});
document.addEventListener('click', (event) => { if (!event.target.closest('.schedule-period-picker-wrap')) closePeriodPicker(); });
calendarEl?.addEventListener('click', (event) => {
  const monthCard = event.target.closest('.calendar-month-card');
  if (!monthCard) return;
  currentDate = new Date(currentDate.getFullYear(), Number(monthCard.dataset.month), 1);
  selectedDate = new Date(currentDate);
  viewMode = 'month';
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', item.dataset.view === 'month'));
  subscribeLeave();
  renderCalendar();
});

calendarEl?.addEventListener('click', (event) => {
  const eventEl = event.target.closest('.calendar-event');
  const dayEl = event.target.closest('.calendar-day');
  if (!dayEl) return;
  selectedDate = new Date(`${dayEl.dataset.date}T00:00:00`);
  currentDate = viewMode === 'week' ? new Date(selectedDate) : currentDate;
  subscribeLeave();
  renderCalendar();
  if (canEditSchedule) openModal(dayEl.dataset.date, eventEl?.dataset.id || null);
});

savedLabelsEl?.addEventListener('click', (event) => {
  const chip = event.target.closest('.saved-label-chip');
  if (!chip) return;
  colorInput.value = chip.dataset.color;
  labelNameInput.value = chip.dataset.name;
});

labelFilterSelect?.addEventListener('change', () => { activeLabelFilter = labelFilterSelect.value; renderCalendar(); });

document.querySelector('#prevSchedulePeriod')?.addEventListener('click', () => { if (viewMode === 'year') currentDate.setFullYear(currentDate.getFullYear() - 1); else if (viewMode === 'month') currentDate.setMonth(currentDate.getMonth() - 1); else currentDate.setDate(currentDate.getDate() - 7); selectedDate = new Date(currentDate); subscribeLeave(); renderCalendar(); });
document.querySelector('#nextSchedulePeriod')?.addEventListener('click', () => { if (viewMode === 'year') currentDate.setFullYear(currentDate.getFullYear() + 1); else if (viewMode === 'month') currentDate.setMonth(currentDate.getMonth() + 1); else currentDate.setDate(currentDate.getDate() + 7); selectedDate = new Date(currentDate); subscribeLeave(); renderCalendar(); });
document.querySelector('#todaySchedulePeriod')?.addEventListener('click', () => { currentDate = new Date(); selectedDate = new Date(); subscribeLeave(); renderCalendar(); });
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { viewMode = button.dataset.view; document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', item === button)); currentDate = new Date(selectedDate); renderCalendar(); }));
document.querySelector('#phoneDutyButton')?.addEventListener('click', (event) => showSpecials('phone', event.currentTarget));
document.querySelector('#companyEventButton')?.addEventListener('click', (event) => showSpecials('event', event.currentTarget));
document.querySelector('#closeScheduleModal')?.addEventListener('click', closeModal);
document.querySelector('#cancelScheduleButton')?.addEventListener('click', closeModal);
modalEl?.addEventListener('click', (event) => { if (event.target === modalEl) closeModal(); });
document.addEventListener('click', (event) => { if (tooltipEl && !tooltipEl.contains(event.target) && !event.target.closest('.schedule-special-trigger')) tooltipEl.hidden = true; });

formEl?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canEditSchedule) return setMessage('您沒有編輯權限。');
  if (!scheduleCollection) return setMessage('Firebase 尚未完成初始化，無法儲存排程。');
  const reminderAt = new Date(document.querySelector('#scheduleReminderAt').value);
  const staffIds = [...staffSelect.selectedOptions].map((option) => option.value);
  const user = currentUser();
  const action = editingId ? '編輯' : '新增';
  const labelName = labelNameInput.value.trim();
  const labelColor = colorInput.value;
  const repeat = repeatSelect?.value || 'none';
  const repeatInterval = Math.max(1, Number(repeatIntervalInput?.value) || 1);
  const payload = {
    date: toDateKey(reminderAt), labelColor, labelName, repeat,
    title: document.querySelector('#scheduleTitle').value.trim(),
    content: document.querySelector('#scheduleContent').value.trim(),
    reminderAt: firebase.firestore.Timestamp.fromDate(reminderAt), staffIds,
    staffNames: staffIds.map((id) => staffList.find((staff) => staff.id === id)?.name || '').filter(Boolean),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: user, deleted: false,
    history: firebase.firestore.FieldValue.arrayUnion({ action, userId: user.id, userName: user.name, at: firebase.firestore.Timestamp.fromDate(new Date()) })
  };
  if (repeat === 'custom') payload.repeatInterval = repeatInterval;
  else if (editingId) payload.repeatInterval = firebase.firestore.FieldValue.delete();
  if (!payload.title) return setMessage('請輸入標題。');
  try {
    await saveLabelIfNeeded(labelName, labelColor);
    if (editingId) await scheduleCollection.doc(editingId).update(payload);
    else await scheduleCollection.add({ ...payload, createdBy: user, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeModal();
  } catch (error) { console.error('儲存排程失敗：', error); setMessage('儲存排程失敗，請稍後再試。'); }
});

deleteButton?.addEventListener('click', async () => {
  if (!canDeleteSchedule) return setMessage('您沒有刪除權限。');
  if (!editingId || !scheduleCollection || !confirm('確定要刪除此排程嗎？')) return;
  const user = currentUser();
  await scheduleCollection.doc(editingId).update({ deleted: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: user, history: firebase.firestore.FieldValue.arrayUnion({ action: '刪除', userId: user.id, userName: user.name, at: firebase.firestore.Timestamp.fromDate(new Date()) }) });
  closeModal();
});

if (!scheduleDb) setStatus('Firebase 尚未完成初始化，請確認 firebase-init.js 是否已載入。', 'error');
else {
  unsubscribeStaff = scheduleStaffCollection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => { staffList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(activeStaff); renderStaffOptions(); }, (error) => console.error('讀取人員資料失敗：', error));
  subscribeSchedules();
  subscribeLabels();
  subscribeLeave();
}

syncSchedulePermission();
renderCalendar();
window.addEventListener('beforeunload', () => { unsubscribeStaff?.(); unsubscribeSchedules?.(); unsubscribeLabels?.(); unsubscribeLeave?.(); });
